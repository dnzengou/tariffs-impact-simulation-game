'use strict';

// Initialize SVG and Plotly once
const svg = d3.select('#gridSvg');
const cellSize = 400 / 20;
const cells = svg.selectAll('rect')
    .data(new Float32Array(20 * 20))
    .enter()
    .append('rect')
    .attr('x', (_, i) => (i % 20) * cellSize)
    .attr('y', (_, i) => Math.floor(i / 20) * cellSize)
    .attr('width', cellSize)
    .attr('height', cellSize)
    .attr('fill', 'gray');

const tbody = d3.select('#resultsTable tbody');
Plotly.newPlot('payoffChart', [], {
    title: 'Cumulative Payoffs Over Rounds',
    xaxis: { title: 'Round' },
    yaxis: { title: 'Cumulative Payoff' },
    hovermode: 'closest'
});

// Web Worker setup
const worker = new Worker('worker.js');

function runSimulation() {
    const runButton = document.getElementById('runButton');
    runButton.disabled = true;
    runButton.textContent = 'Running...';

    const numRounds = parseInt(document.getElementById('numRounds').value, 10);
    const mistakeProb = parseFloat(document.getElementById('mistakeProb').value);
    const usStrategy = document.getElementById('usStrategy').value;
    const euStrategy = document.getElementById('euStrategy').value;

    worker.postMessage({ numRounds, mistakeProb, usStrategy, euStrategy });
}

worker.onmessage = function(e) {
    const { payoffs, grid, payoffHistory } = e.data;

    // Update grid visualization
    requestAnimationFrame(() => {
        cells.data(grid).attr('fill', d => d3.interpolateRdYlGn(d));
    });

    // Update table
    const tableData = Object.entries(payoffs).map(([agent, payoff]) => ({ agent, payoff: payoff.toFixed(2) }));
    const rows = tbody.selectAll('tr').data(tableData);
    rows.exit().remove();
    const enterRows = rows.enter().append('tr');
    enterRows.append('td').text(d => d.agent);
    enterRows.append('td').text(d => d.payoff);
    rows.selectAll('td').data(d => [d.agent, d.payoff]).text(d => d);

    // Update Plotly chart
    const rounds = Array.from({ length: payoffHistory.US.length }, (_, i) => i + 1);
    Plotly.update('payoffChart', {
        x: [rounds, rounds, rounds, rounds],
        y: [payoffHistory.US, payoffHistory.EU, payoffHistory.EM, payoffHistory.Crypto]
    }, {
        traces: [
            { name: 'U.S. Treasury', type: 'scatter', mode: 'lines', line: { color: 'blue' } },
            { name: 'EU', type: 'scatter', mode: 'lines', line: { color: 'red' } },
            { name: 'Emerging Markets', type: 'scatter', mode: 'lines', line: { color: 'green' } },
            { name: 'Crypto Market', type: 'scatter', mode: 'lines', line: { color: 'purple' } }
        ]
    });

    // Reset button
    const runButton = document.getElementById('runButton');
    runButton.disabled = false;
    runButton.textContent = 'Run Simulation';
};

worker.onerror = function(error) {
    console.error('Worker error:', error);
    const runButton = document.getElementById('runButton');
    runButton.disabled = false;
    runButton.textContent = 'Run Simulation (Error)';
};
