        // Clean data will be inserted here
        const data = DATA_PLACEHOLDER;

        // Global state with embedded data and pagination
        let bugsData = [];
        let filteredData = [];
        let currentPage = 1;
        const pageSize = 25;
        let totalPages = 1;

        // Global filter selections for multiselect dropdowns
        const filterSelections = {
            status: new Set(),
            severity: new Set(),
            assignee: new Set(),
            leadingTeam: new Set(),
            system: new Set(),
            sprint: new Set()
        };

        // Initialize the application
        function initializeApp() {
            try {
                console.log('🚀 Initializing dashboard...');
                
                bugsData = data.bugs;
                filteredData = [...bugsData];

                console.log(`✅ Loaded ${bugsData.length} bugs from embedded data`);
                
                displayStats();
                populateFilters();
                applyFilters();
                setupEventListeners();
                
                document.getElementById('dashboard-content').style.display = 'block';
                document.getElementById('status').innerHTML = `<span class="success">✅ Dashboard ready with ${bugsData.length} bugs</span>`;
                
                if (data.metadata && data.metadata.exported) {
                    document.getElementById('lastUpdate').textContent = new Date(data.metadata.exported).toLocaleString();
                }
                
            } catch (error) {
                console.error('❌ Failed to initialize:', error);
                document.getElementById('status').innerHTML = `<span class="error">❌ Error: ${error.message}</span>`;
            }
        }

        // Display statistics
        function displayStats() {
            const stats = calculateStats(bugsData);
            document.getElementById('totalBugs').textContent = stats.totalBugs;
            document.getElementById('highPriorityBugs').textContent = stats.highSeverity || 0;
            document.getElementById('deployedBugs').textContent = stats.deployed || 0;
            document.getElementById('avgDaysOpen').textContent = stats.avgDaysOpen;
        }

        function calculateStats(bugs) {
            const totalBugs = bugs.length;
            const highSeverity = bugs.filter(b => b.priority === 'High').length;
            const deployed = bugs.filter(b => b.status === 'Deployed').length;
            const avgDaysOpen = Math.round(bugs.reduce((sum, b) => sum + (b.daysOpen || 0), 0) / totalBugs) || 0;
            
            return { totalBugs, highSeverity, deployed, avgDaysOpen };
        }

        // Populate filters (basic version)
        function populateFilters() {
            console.log('🔧 Populating filters...');
            // For now, just log that filters would be populated
            // The UI elements may not exist in current template
        }

        // Apply filters
        function applyFilters() {
            const searchInput = document.getElementById('searchFilter');
            const searchFilter = searchInput ? searchInput.value.toLowerCase() : '';
            
            filteredData = bugsData.filter(bug => {
                if (!searchFilter) return true;
                return (bug.summary && bug.summary.toLowerCase().includes(searchFilter)) ||
                       (bug.key && bug.key.toLowerCase().includes(searchFilter));
            });
            
            totalPages = Math.ceil(filteredData.length / pageSize);
            if (currentPage > totalPages) currentPage = 1;
            
            displayBugsTable();
            updatePaginationControls();
        }

        // Display bugs table
        function displayBugsTable() {
            const tbody = document.querySelector('table tbody');
            if (!tbody) return;
            
            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const pageData = filteredData.slice(startIndex, endIndex);
            
            if (pageData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px;">No bugs found</td></tr>';
                return;
            }
            
            tbody.innerHTML = pageData.map(bug => {
                const jiraUrl = `https://hibob.atlassian.net/browse/${bug.key}`;
                return `<tr>
                    <td><a href="${jiraUrl}" target="_blank" class="bug-key">${bug.key}</a></td>
                    <td style="max-width: 350px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(bug.summary || '')}</td>
                    <td><span class="status-badge">${bug.status}</span></td>
                    <td><span class="priority-${(bug.priority || 'medium').toLowerCase()}">${bug.priority || 'Medium'}</span></td>
                    <td>${bug.assignee || 'Unassigned'}</td>
                    <td>${bug.leadingTeam || 'N/A'}</td>
                    <td>${bug.system || 'N/A'}</td>
                    <td>${bug.sprint || 'N/A'}</td>
                    <td>${bug.daysOpen || 0} days</td>
                </tr>`;
            }).join('');
        }

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Update pagination
        function updatePaginationControls() {
            const pageInfo = document.getElementById('pageInfo');
            const firstBtn = document.getElementById('firstPageBtn');
            const prevBtn = document.getElementById('prevPageBtn');
            const nextBtn = document.getElementById('nextPageBtn');
            const lastBtn = document.getElementById('lastPageBtn');
            
            if (pageInfo) {
                pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${filteredData.length} items, ${pageSize} per page)`;
            }
            
            if (firstBtn) firstBtn.disabled = currentPage === 1;
            if (prevBtn) prevBtn.disabled = currentPage === 1;
            if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;
            if (lastBtn) lastBtn.disabled = currentPage === totalPages || totalPages === 0;
        }

        // Navigate to page
        function goToPage(page) {
            if (page < 1 || page > totalPages) return;
            currentPage = page;
            displayBugsTable();
            updatePaginationControls();
        }

        // Set up event listeners
        function setupEventListeners() {
            const searchInput = document.getElementById('searchFilter');
            if (searchInput) {
                let searchTimeout;
                searchInput.addEventListener('input', () => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        currentPage = 1;
                        applyFilters();
                    }, 300);
                });
            }
            
            const clearButton = document.getElementById('clearFiltersButton');
            if (clearButton) {
                clearButton.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    currentPage = 1;
                    applyFilters();
                });
            }
        }

        // Initialize app when DOM is ready
        document.addEventListener('DOMContentLoaded', initializeApp);