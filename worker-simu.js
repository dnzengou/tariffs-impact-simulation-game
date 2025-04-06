const sum = arr => arr.reduce((a, b) => a + b, 0);

const GRID_SIZE = 20;
const DISCOUNT_FACTOR = 0.9;

const NEIGHBOR_OFFSETS = [];
for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        NEIGHBOR_OFFSETS.push([di, dj]);
    }
}

const agents = {
    'US': {
        strategies: {
            escalate: () => ({ tariffs: [0.1, 0.54, 0.2], lngLeverage: true }),
            moderate: () => ({ tariffs: [0.25, 0.25, 0.25], lngLeverage: false }),
            negotiate: () => ({ tariffs: [0, 0, 0], lngLeverage: false })
        },
        payoff: (action, oppActions) => {
            const revenue = action.tariffs.reduce((acc, t, i) => acc + t * (i === 0 ? 1000 : i === 1 ? 2000 : 500), 0);
            const gdpImpact = action.lngLeverage ? -1.2 : action.tariffs[0] ? -0.5 : 0.5;
            const chinaRetaliation = oppActions.China?.counterTariffs ? -10 : 0;
            return revenue / 10 + gdpImpact + chinaRetaliation;
        }
    },
    'EU': {
        strategies: {
            accept: () => ({ debtSwap: true, counterTariffs: 0 }),
            retaliate: () => ({ debtSwap: false, counterTariffs: 0.2 }),
            diversify: () => ({ debtSwap: false, counterTariffs: 0, cryptoShift: true }),
            ignore: () => ({ debtSwap: false, counterTariffs: 0 })
        },
        payoff: (action, oppActions) => {
            const lngCost = oppActions.US?.lngLeverage && action.counterTariffs > 0 ? -10 : 0;
            const tradeLoss = oppActions.US?.tariffs[2] * -50 || 0;
            const chinaTrade = oppActions.China?.tradeShift ? 5 : 0;
            return lngCost + tradeLoss + (action.debtSwap ? -30 : 0) + chinaTrade;
        }
    },
    'China': {
        strategies: {
            retaliate: () => ({ counterTariffs: 0.34, tradeShift: false }),
            redirect: () => ({ counterTariffs: 0, tradeShift: true }),
            ignore: () => ({ counterTariffs: 0, tradeShift: false })
        },
        payoff: (action, oppActions) => {
            const tariffHit = oppActions.US?.tariffs[1] * -200 || 0;
            const retaliationCost = action.counterTariffs ? -20 : 0;
            return action.tradeShift ? 25 : tariffHit / 5 + retaliationCost;
        }
    },
    'EM': {
        strategies: {
            redirect: () => ({ tradeShift: true, tariffs: 0 }),
            crypto: () => ({ tradeShift: false, cryptoAdopt: true }),
            statusQuo: () => ({ tradeShift: false, tariffs: 0 })
        },
        payoff: (action, oppActions) => {
            const tariffHit = oppActions.US?.tariffs[1] * -200 || 0;
            const chinaBoost = oppActions.China?.tradeShift ? 10 : 0;
            return action.tradeShift ? 25 + chinaBoost : action.cryptoAdopt ? -10 : tariffHit / 4;
        }
    },
    'Crypto': {
        strategies: {
            invest: () => ({ btcInvestment: 1 }),
            sell: () => ({ btcInvestment: -1 }),
            hold: () => ({ btcInvestment: 0 })
        },
        payoff: (action, oppActions) => {
            const instability = (oppActions.US?.tariffs[0] || 0) + (oppActions.EU?.counterTariffs || 0) + (oppActions.China?.counterTariffs || 0);
            return action.btcInvestment * (45 + instability * 10);
        }
    }
};

const grid = new Float32Array(GRID_SIZE * GRID_SIZE).fill(1);
const blocs = [
    { coords: [[0, 0], [5, 5]], tariffFactor: 0.5 },  // USMCA
    { coords: [[10, 10], [15, 15]], tariffFactor: 1.5 } // BRICS
];

function updateGrid(actions) {
    const newGrid = new Float32Array(grid);
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            const idx = i * GRID_SIZE + j;
            const tariffImpact = actions.US.tariffs.reduce((acc, t) => acc + t, 0) / 3;
            const retaliationImpact = (actions.EU.counterTariffs || 0) + (actions.China.counterTariffs || 0);
            let neighborSum = 0;
            for (const [di, dj] of NEIGHBOR_OFFSETS) {
                const ni = (i + di + GRID_SIZE) % GRID_SIZE;
                const nj = (j + dj + GRID_SIZE) % GRID_SIZE;
                neighborSum += grid[ni * GRID_SIZE + nj];
            }
            const neighborHealth = neighborSum / 8;
            const blocFactor = blocs.find(b => i >= b.coords[0][0] && i <= b.coords[1][0] && 
                                              j >= b.coords[0][1] && j <= b.coords[1][1])?.tariffFactor || 1;
            newGrid[idx] = Math.max(0, Math.min(1, grid[idx] - tariffImpact * blocFactor - retaliationImpact + neighborHealth * 0.1));
        }
    }
    grid.set(newGrid);
    return Array.from(grid);
}

function runSimulation({ simulationType, numRounds, mistakeProb, usStrategy, euStrategy, chinaStrategy }) {
    const strategies = [
        { name: 'US', strategy: usStrategy },
        { name: 'EU', strategy: euStrategy },
        { name: 'China', strategy: chinaStrategy },
        { name: 'EM', strategy: 'redirect' },
        { name: 'Crypto', strategy: 'invest' }
    ];
    const payoffs = Array(numRounds).fill(0).map(() => ({}));
    const actions = Array(numRounds).fill(0).map(() => ({}));
    const payoffHistory = { US: [], EU: [], China: [], EM: [], Crypto: [] };
    const gridHistory = simulationType === 'CA' ? [Array.from(grid)] : null;

    for (let round = 0; round < numRounds; round++) {
        strategies.forEach(agent => {
            const oppActions = round === 0 ? {} : actions[round - 1];
            const stratFunc = agents[agent.name].strategies[agent.strategy];
            let action = stratFunc();
            if (Math.random() < mistakeProb) {
                const strats = Object.keys(agents[agent.name].strategies);
                action = agents[agent.name].strategies[strats[Math.floor(Math.random() * strats.length)]]();
            }
            actions[round][agent.name] = action;
            const payoff = agents[agent.name].payoff(action, oppActions);
            payoffs[round][agent.name] = payoff;
            payoffHistory[agent.name].push(payoffHistory[agent.name].length > 0 ? payoffHistory[agent.name].at(-1) + payoff : payoff);
            if (round > 0 && Math.random() < 0.2 && agent.name !== 'US' && agent.name !== 'EU' && agent.name !== 'China') {
                const prevPayoff = payoffs[round - 1][agent.name];
                if (payoffs[round][agent.name] < prevPayoff) {
                    const strats = Object.keys(agents[agent.name].strategies);
                    agent.strategy = strats[Math.floor(Math.random() * strats.length)];
                }
            }
        });
        if (simulationType === 'CA') gridHistory.push(updateGrid(actions[round]));
    }

    const accumulatedPayoffs = {};
    Object.keys(agents).forEach(agent => {
        accumulatedPayoffs[agent] = sum(payoffs.map((r, i) => r[agent] * Math.pow(DISCOUNT_FACTOR, i)));
    });

    postMessage({ payoffs: accumulatedPayoffs, gridHistory, payoffHistory });
}

self.onmessage = function(e) {
    runSimulation(e.data);
};
