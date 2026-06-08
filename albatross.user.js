// ==UserScript==
// @name         Albatross (V1.0.0)
// @namespace    https://github.com/jcnva
// @version      1.0.0
// @description  Filters barcharts against your lifelist
// @author       jcnva
// @match        https://ebird.org/barchart*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. UI Styles
    const style = document.createElement('style');
    style.textContent = `
        #ett-target-tool { position: fixed; bottom: 20px; right: 20px; width: 350px; background: white; border: 2px solid #4a90e2; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 999999; }
        #ett-header { background: #4a90e2; color: white; padding: 10px 15px; font-weight: bold; border-radius: 6px 6px 0 0; }
        #ett-body { padding: 15px; display: block; }
        .ett-btn { background: #28a745; color: white; border: none; padding: 12px; border-radius: 4px; width: 100%; font-weight: bold; cursor: pointer; margin-top: 10px; transition: background 0.2s; }
        .ett-btn.revert { background: #6c757d; }
        .ett-score-badge { font-size: 10px; background: #eef; color: #4a90e2; padding: 2px 5px; border-radius: 3px; margin-left: 8px; font-weight: bold; }
        #ett-count-display { font-weight: bold; color: #4a90e2; margin-top: 10px; text-align: center; border-top: 1px solid #eee; padding-top: 5px; }
        #ett-chart-container { display: none; margin-top: 15px; background: #fafafa; padding: 10px; border-radius: 6px; border: 1px solid #ddd; }
    `;
    document.head.appendChild(style);

    // 2. Build UI
    const container = document.createElement('div');
    container.id = 'ett-target-tool';
    container.innerHTML = `
        <div id="ett-header">🎯 Filter Barchart</div>
        <div id="ett-body">
            <label style="font-size:11px; font-weight:bold; color:#555;">Upload Lifelist CSV (Saves Automatically):</label>
            <input type="file" id="ett-csv-upload" accept=".csv" style="width:100%; margin-bottom:5px; font-size:12px;" />
            <button id="ett-toggle" class="ett-btn">Apply Filter & Sort</button>
            <div id="ett-chart-container"></div>
            <div id="ett-count-display">Status: Original Layout</div>
            <div id="ett-status" style="font-size: 11px; margin-top:5px; text-align:center;">Ready.</div>
        </div>
    `;
    document.body.appendChild(container);

    let isFiltered = false;
    const originalDOMMap = new Map();

    document.querySelectorAll('tbody tr').forEach(row => {
        originalDOMMap.set(row, { parent: row.parentNode, nextSibling: row.nextSibling, display: row.style.display });
    });

    function getMonthRange() {
        const urlParams = new URLSearchParams(window.location.search);
        const m = urlParams.get('m'), bmo = urlParams.get('bmo'), emo = urlParams.get('emo');
        if (m) return [parseInt(m), parseInt(m)];
        if (bmo && emo) return [parseInt(bmo), parseInt(emo)];
        return [1, 12];
    }

    // --- CHART ENGINE ---
    function renderChart() {
        const weeklyTally = new Array(48).fill(0);
        const visibleRows = Array.from(document.querySelectorAll('tbody tr')).filter(r => r.style.display !== 'none' && r.querySelector('.SpeciesName'));

        visibleRows.forEach(row => {
            const monthCells = Array.from(row.cells).slice(-12);
            
            monthCells.forEach((td, mIdx) => {
                const weeks = Array.from(td.children);
                weeks.forEach((weekEl, wIdx) => {
                    if (wIdx < 4) {
                        const globalWeekIdx = (mIdx * 4) + wIdx;
                        
                        weekEl.querySelectorAll('*').forEach(el => {
                            Array.from(el.classList).forEach(cls => {
                                const match = cls.match(/^b([1-9])$/);
                                if (match) weeklyTally[globalWeekIdx] += parseInt(match[1]);
                            });
                        });

                        Array.from(weekEl.classList).forEach(cls => {
                            const match = cls.match(/^b([1-9])$/);
                            if (match) weeklyTally[globalWeekIdx] += parseInt(match[1]);
                        });
                    }
                });
            });
        });

        const maxTally = Math.max(...weeklyTally) || 1;
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let chartHtml = `<div style="text-align:center; font-weight:bold; font-size:12px; margin-bottom:8px; color:#333;">Lifer Potential by Week</div>`;
        chartHtml += `<div style="display:flex; height:80px; align-items:flex-end; border-bottom:2px solid #555; gap:1px;">`;
        
        weeklyTally.forEach((val, i) => {
            const height = (val / maxTally) * 100;
            const title = `${monthNames[Math.floor(i/4)]} W${(i%4)+1}: ${val} Pts`;
            chartHtml += `<div title="${title}" style="flex:1; margin-left:${(i%4===0&&i!==0)?'3px':'0'}; background:#8e44ad; height:${height}%; min-height:1px; transition:background 0.2s;" onmouseover="this.style.background='#d35400'" onmouseout="this.style.background='#8e44ad'"></div>`;
        });
        
        chartHtml += `</div><div style="display:flex; justify-content:space-between; font-size:9px; color:#777; margin-top:4px;"><span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec</span></div>`;
        
        const container = document.getElementById('ett-chart-container');
        container.innerHTML = chartHtml; 
        container.style.display = 'block';
    }

    // --- MAIN ENGINE ---
    function executeFilterAndSort() {
        try {
            const [startMonth, endMonth] = getMonthRange();
            const rows = Array.from(document.querySelectorAll('tbody tr'));
            const speciesRows = [];
            let masterParent = null;
            let dateRangeKept = false;
            let myLifelist = new Set(JSON.parse(localStorage.getItem('ebirdLifelist_csv_saved') || '[]'));

            rows.forEach(row => {
                const textContent = row.textContent.toLowerCase();
                const isSpecies = row.querySelector('.SpeciesName');

                if (textContent.includes('date range')) {
                    row.style.display = (!dateRangeKept) ? '' : 'none';
                    if (row.style.display === '') dateRangeKept = true;
                    return;
                }

                if (!isSpecies) { row.style.display = 'none'; return; }

                const nameText = isSpecies.textContent.trim().toLowerCase();
                
                const isExcluded = nameText.includes(' sp.') || 
                                   nameText.includes('/') || 
                                   nameText.includes('hybrid') || 
                                   (row.querySelector('.Icon--exoticEscapee') !== null) || 
                                   myLifelist.has(nameText);
                
                if (isExcluded) { row.style.display = 'none'; return; }

                const monthCells = Array.from(row.cells).slice(-12);
                if (monthCells.length < 12) { row.style.display = 'none'; return; }

                row.style.display = '';
                if (!masterParent) masterParent = row.parentNode;

                let score = 0;

                for (let m = startMonth; m <= endMonth; m++) {
                    const td = monthCells[m - 1]; 
                    if (td) {
                        td.querySelectorAll('*').forEach(el => {
                            Array.from(el.classList).forEach(cls => {
                                const match = cls.match(/^b([1-9])$/);
                                if (match) score += parseInt(match[1]);
                            });
                        });
                        Array.from(td.classList).forEach(cls => {
                            const match = cls.match(/^b([1-9])$/);
                            if (match) score += parseInt(match[1]);
                        });
                    }
                }

                row.dataset.score = score;
                let badge = isSpecies.querySelector('.ett-score-badge') || document.createElement('span');
                badge.className = 'ett-score-badge';
                badge.textContent = `(${score})`;
                if (!isSpecies.contains(badge)) isSpecies.appendChild(badge);
                speciesRows.push(row);
            });

            speciesRows.sort((a, b) => (parseInt(b.dataset.score) || 0) - (parseInt(a.dataset.score) || 0));
            if (masterParent) speciesRows.forEach(row => masterParent.appendChild(row));

            document.getElementById('ett-count-display').textContent = `Visible: ${speciesRows.length}`;
            document.getElementById('ett-status').textContent = `Sorted (Months ${startMonth}-${endMonth})`;
            
            renderChart();

        } catch (error) {
            console.error(error);
            document.getElementById('ett-status').textContent = "Error. Check Console.";
        }
    }

    // --- REVERT ENGINE ---
    function restoreOriginal() {
        originalDOMMap.forEach((cache, row) => {
            if (cache.parent) cache.parent.insertBefore(row, cache.nextSibling);
            row.style.display = cache.display;
            const badge = row.querySelector('.ett-score-badge'); if (badge) badge.remove();
        });
        document.getElementById('ett-chart-container').style.display = 'none';
        document.getElementById('ett-count-display').textContent = "Status: Original Layout";
    }

    const toggleBtn = document.getElementById('ett-toggle');
    toggleBtn.onclick = () => {
        if (!isFiltered) { 
            executeFilterAndSort(); 
            toggleBtn.textContent = "Show Original Layout"; 
            toggleBtn.classList.add('revert'); 
            isFiltered = true; 
        } else { 
            restoreOriginal(); 
            toggleBtn.textContent = "Apply Filter & Sort"; 
            toggleBtn.classList.remove('revert'); 
            isFiltered = false; 
        }
    };

    // --- FILE UPLOAD HANDLER ---
    document.getElementById('ett-csv-upload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            const speciesSet = new Set();
            let commonNameIdx = -1;
            let countableIdx = 12; // 13th column (0-indexed)
            
            evt.target.result.split('\n').forEach((line) => {
                if (!line.trim()) return; 

                const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                
                // Identify column mapping dynamically from the header row
                if (commonNameIdx === -1) { 
                    const cIdx = cols.findIndex(c => c.toLowerCase().includes('common name')); 
                    if (cIdx !== -1) {
                        commonNameIdx = cIdx; 
                        
                        // Guardrail: dynamically find the Countable column if it's not strictly the 13th
                        const countIdx = cols.findIndex(c => c.toLowerCase().includes('countable'));
                        if (countIdx !== -1) {
                            countableIdx = countIdx;
                        }
                    }
                    return; 
                } 
                
                // Parse the data rows
                if (commonNameIdx !== -1 && cols[commonNameIdx]) { 
                    
                    // Disqualify instantly if the 13th column is not '1'
                    if (cols[countableIdx]) {
                        const isCountable = cols[countableIdx].replace(/"/g, '').trim();
                        if (isCountable !== '1') return; 
                    } else {
                        return; // Skip if row is malformed and missing the 13th column
                    }

                    let name = cols[commonNameIdx].replace(/"/g, '').trim().toLowerCase();
                    
                    if (name && name !== 'common name') {
                        speciesSet.add(name);
                    }
                }
            });
            
            localStorage.setItem('ebirdLifelist_csv_saved', JSON.stringify(Array.from(speciesSet)));
            
            if (isFiltered) restoreOriginal();
            
            executeFilterAndSort(); 
            toggleBtn.textContent = "Show Original Layout"; 
            toggleBtn.classList.add('revert'); 
            isFiltered = true;
            
            document.getElementById('ett-status').textContent = `Loaded ${speciesSet.size} countable species & Applied!`;
        };
        reader.readAsText(file);
    });

    // --- ON LOAD: Auto-Resume Saved Data ---
    const savedList = JSON.parse(localStorage.getItem('ebirdLifelist_csv_saved') || '[]');
    if (savedList.length > 0) {
        document.getElementById('ett-status').textContent = `Auto-loaded ${savedList.length} species from memory.`;
        executeFilterAndSort();
        toggleBtn.textContent = "Show Original Layout";
        toggleBtn.classList.add('revert');
        isFiltered = true;
    }

})();
