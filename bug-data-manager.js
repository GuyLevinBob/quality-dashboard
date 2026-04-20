// Bug Data Manager - Handles data fetching, caching, filtering, and pagination
class BugDataManager {
    constructor(options = {}) {
        this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:3002';
        this.cache = new BugCache();
        this.pagingState = {
            currentPage: 1,
            pageSize: options.pageSize || 50,
            totalPages: 0
        };
        
        // Data state
        this.allBugs = []; // Full lightweight dataset for filtering
        this.filteredBugs = []; // Filtered dataset
        this.visibleBugs = []; // Currently displayed bugs (paginated)
        
        // Filter state
        this.filterState = {
            status: new Set(),
            severity: new Set(),
            assignee: new Set(),
            leadingTeam: new Set(),
            system: new Set(),
            sprint: new Set(),
            regression: new Set(),
            search: ''
        };
        
        // Sort state
        this.sortState = {
            column: null,
            direction: 'desc'
        };
        
        // Loading state
        this.isLoading = false;
        this.isSyncing = false;
        
        console.log('🚀 Bug Data Manager initialized');
    }

    // Initialize data - load from cache then sync in background
    async initialize() {
        console.log('🔄 Initializing Bug Data Manager...');
        
        try {
            // 1. Try to load from cache first for instant UI
            const cached = this.cache.getCachedBugs();
            if (cached && cached.bugs.length > 0) {
                console.log('⚡ Loading from cache for instant display...');
                this.allBugs = cached.bugs;
                this.restoreFilterAndSortState();
                this.applyFiltersAndPaging();
                
                // Show cached data immediately
                this.notifyDataChanged('cache-loaded');
                
                // Check if we need to sync in background
                const lastSync = new Date(cached.lastSync);
                const now = new Date();
                const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60);
                
                if (hoursSinceSync > 0.5) { // Sync if older than 30 minutes
                    console.log(`🔄 Cache is ${Math.round(hoursSinceSync * 60)} minutes old, syncing in background...`);
                    this.syncInBackground();
                } else {
                    console.log('✅ Cache is fresh, no sync needed');
                    this.notifyDataChanged('ready');
                }
            } else {
                console.log('📥 No cache found, performing initial sync...');
                await this.performFullSync();
            }
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.notifyError('Failed to initialize data', error);
        }
    }

    // Perform full sync from API
    async performFullSync() {
        if (this.isSyncing) {
            console.log('⏸️ Sync already in progress');
            return;
        }

        try {
            this.isSyncing = true;
            this.notifyDataChanged('syncing');
            
            console.log('🔄 Starting full sync...');
            
            // First try to get lightweight data
            const response = await fetch(`${this.apiBaseUrl}/api/bugs-lite`);
            if (!response.ok) {
                throw new Error(`API responded with ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.metadata?.needsInitialSync) {
                console.log('🔄 Server needs initial sync, triggering sync...');
                await this.triggerServerSync();
                
                // Retry getting data after sync
                const retryResponse = await fetch(`${this.apiBaseUrl}/api/bugs-lite`);
                const retryData = await retryResponse.json();
                this.allBugs = retryData.bugs || [];
            } else {
                this.allBugs = data.bugs || [];
            }
            
            // Cache the data
            this.cache.saveBugsToCache(this.allBugs, data.metadata);
            
            // Apply filters and update UI
            this.applyFiltersAndPaging();
            
            console.log(`✅ Full sync complete: ${this.allBugs.length} bugs loaded`);
            this.notifyDataChanged('sync-complete');
            
        } catch (error) {
            console.error('❌ Full sync failed:', error);
            this.notifyError('Sync failed', error);
        } finally {
            this.isSyncing = false;
        }
    }

    // Sync in background (incremental)
    async syncInBackground() {
        if (this.isSyncing) return;

        try {
            this.isSyncing = true;
            console.log('🔄 Background sync starting...');
            
            const lastSync = this.cache.getLastSync();
            await this.triggerServerSync(lastSync);
            
            // Get updated data
            const response = await fetch(`${this.apiBaseUrl}/api/bugs-lite`);
            const data = await response.json();
            
            // Update local data
            this.allBugs = data.bugs || [];
            
            // Update cache
            this.cache.saveBugsToCache(this.allBugs, data.metadata);
            
            // Reapply current filters
            this.applyFiltersAndPaging();
            
            console.log('✅ Background sync complete');
            this.notifyDataChanged('background-sync-complete');
            
        } catch (error) {
            console.warn('⚠️ Background sync failed:', error);
            // Don't show error for background sync failures
        } finally {
            this.isSyncing = false;
        }
    }

    // Trigger server-side sync
    async triggerServerSync(since = null) {
        const syncPayload = since ? { since } : {};
        
        const response = await fetch(`${this.apiBaseUrl}/api/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(syncPayload)
        });
        
        if (!response.ok) {
            throw new Error(`Sync request failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`✅ Server sync complete: ${result.syncType}, ${result.bugsProcessed} bugs processed`);
    }

    // Apply filters to the full dataset
    applyFilters() {
        console.log('🔍 Applying filters to full dataset...');
        
        this.filteredBugs = this.allBugs.filter(bug => {
            // Status filter
            if (this.filterState.status.size > 0 && !this.filterState.status.has(bug.status)) {
                return false;
            }
            
            // Severity filter (using priority as severity for now)
            if (this.filterState.severity.size > 0 && !this.filterState.severity.has(bug.priority)) {
                return false;
            }
            
            // Assignee filter
            if (this.filterState.assignee.size > 0 && !this.filterState.assignee.has(bug.assignee)) {
                return false;
            }
            
            // Leading team filter (may be null in lightweight data)
            if (this.filterState.leadingTeam.size > 0 && !this.filterState.leadingTeam.has(bug.leadingTeam)) {
                return false;
            }
            
            // System filter
            if (this.filterState.system.size > 0 && !this.filterState.system.has(bug.system)) {
                return false;
            }
            
            // Sprint filter (using sprintName)
            if (this.filterState.sprint.size > 0 && !this.filterState.sprint.has(bug.sprintName)) {
                return false;
            }
            
            // Regression filter
            if (this.filterState.regression.size > 0 && !this.filterState.regression.has(bug.regression)) {
                return false;
            }
            
            // Search filter (summary, key, assignee)
            if (this.filterState.search) {
                const search = this.filterState.search.toLowerCase();
                const matchesSummary = bug.summary && bug.summary.toLowerCase().includes(search);
                const matchesKey = bug.key && bug.key.toLowerCase().includes(search);
                const matchesAssignee = bug.assignee && bug.assignee.toLowerCase().includes(search);
                
                if (!matchesSummary && !matchesKey && !matchesAssignee) {
                    return false;
                }
            }
            
            return true;
        });
        
        console.log(`📊 Filtered: ${this.filteredBugs.length} of ${this.allBugs.length} bugs`);
        
        // Save filter state
        this.saveFilterAndSortState();
    }

    // Apply sorting to filtered dataset
    applySorting() {
        if (!this.sortState.column) return;
        
        console.log(`🔄 Sorting by ${this.sortState.column} (${this.sortState.direction})...`);
        
        this.filteredBugs.sort((a, b) => {
            let aVal = a[this.sortState.column];
            let bVal = b[this.sortState.column];
            
            // Handle null/undefined values
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            
            // Convert to strings for consistent comparison
            aVal = String(aVal);
            bVal = String(bVal);
            
            const comparison = aVal.localeCompare(bVal, undefined, { numeric: true });
            
            return this.sortState.direction === 'asc' ? comparison : -comparison;
        });
    }

    // Apply pagination to get visible bugs
    applyPagination() {
        const totalBugs = this.filteredBugs.length;
        this.pagingState.totalPages = Math.ceil(totalBugs / this.pagingState.pageSize);
        
        // Ensure current page is valid
        if (this.pagingState.currentPage > this.pagingState.totalPages) {
            this.pagingState.currentPage = Math.max(1, this.pagingState.totalPages);
        }
        
        const startIndex = (this.pagingState.currentPage - 1) * this.pagingState.pageSize;
        const endIndex = startIndex + this.pagingState.pageSize;
        
        this.visibleBugs = this.filteredBugs.slice(startIndex, endIndex);
        
        console.log(`📄 Page ${this.pagingState.currentPage}/${this.pagingState.totalPages}: showing ${this.visibleBugs.length} bugs (${startIndex + 1}-${Math.min(endIndex, totalBugs)} of ${totalBugs})`);
    }

    // Combined filter, sort, and pagination
    applyFiltersAndPaging() {
        this.applyFilters();
        this.applySorting();
        this.applyPagination();
        this.notifyDataChanged('filtered');
    }

    // Update filter state and reapply
    updateFilter(filterType, values) {
        if (filterType === 'search') {
            this.filterState.search = values;
        } else {
            this.filterState[filterType] = new Set(values);
        }
        
        console.log(`🔍 Filter updated: ${filterType} =`, values);
        this.applyFiltersAndPaging();
    }

    // Update sort state and reapply
    updateSort(column, direction = null) {
        // Toggle direction if same column
        if (this.sortState.column === column && !direction) {
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.column = column;
            this.sortState.direction = direction || 'asc';
        }
        
        console.log(`📊 Sort updated: ${this.sortState.column} ${this.sortState.direction}`);
        this.applyFiltersAndPaging();
    }

    // Navigation methods
    goToPage(page) {
        page = Math.max(1, Math.min(page, this.pagingState.totalPages));
        if (page !== this.pagingState.currentPage) {
            this.pagingState.currentPage = page;
            this.applyPagination();
            this.notifyDataChanged('page-changed');
        }
    }

    nextPage() {
        this.goToPage(this.pagingState.currentPage + 1);
    }

    previousPage() {
        this.goToPage(this.pagingState.currentPage - 1);
    }

    // Get bug details (heavy data on demand)
    async getBugDetails(bugId) {
        try {
            console.log(`📖 Loading details for ${bugId}...`);
            
            const response = await fetch(`${this.apiBaseUrl}/api/bugs/${bugId}/details`);
            if (!response.ok) {
                throw new Error(`Failed to load details: ${response.status}`);
            }
            
            const details = await response.json();
            console.log(`✅ Details loaded for ${bugId}`);
            return details;
            
        } catch (error) {
            console.error(`❌ Failed to load details for ${bugId}:`, error);
            throw error;
        }
    }

    // Save and restore filter/sort state
    saveFilterAndSortState() {
        const filterState = {};
        Object.keys(this.filterState).forEach(key => {
            if (key === 'search') {
                filterState[key] = this.filterState[key];
            } else {
                filterState[key] = Array.from(this.filterState[key]);
            }
        });
        
        this.cache.saveFilterState(filterState, this.sortState);
    }

    restoreFilterAndSortState() {
        const saved = this.cache.restoreFilterState();
        if (!saved) return;

        // Restore filter state
        if (saved.filters) {
            Object.keys(saved.filters).forEach(key => {
                if (key === 'search') {
                    this.filterState[key] = saved.filters[key] || '';
                } else {
                    this.filterState[key] = new Set(saved.filters[key] || []);
                }
            });
        }

        // Restore sort state
        if (saved.sort) {
            this.sortState = { ...this.sortState, ...saved.sort };
        }

        console.log('📋 Filter and sort state restored');
    }

    // Clear all filters
    clearFilters() {
        Object.keys(this.filterState).forEach(key => {
            if (key === 'search') {
                this.filterState[key] = '';
            } else {
                this.filterState[key].clear();
            }
        });
        
        this.applyFiltersAndPaging();
        console.log('🗑️ All filters cleared');
    }

    // Get current state for UI updates
    getState() {
        return {
            allBugs: this.allBugs,
            filteredBugs: this.filteredBugs,
            visibleBugs: this.visibleBugs,
            filterState: this.filterState,
            sortState: this.sortState,
            pagingState: this.pagingState,
            isLoading: this.isLoading,
            isSyncing: this.isSyncing
        };
    }

        // Get filter options for dropdowns
        getFilterOptions() {
            const options = {};
            
            // Extract unique values from all bugs for each filter
            const extractOptions = (field) => {
                const values = new Set();
                this.allBugs.forEach(bug => {
                    const value = bug[field];
                    if (value && value !== 'Unknown' && value !== 'Unassigned' && value !== 'No Data' && value !== null && value !== undefined && value !== '') {
                        values.add(value);
                    }
                });
                return Array.from(values).sort();
            };
            
            options.status = extractOptions('status');
            options.severity = extractOptions('priority'); // Using priority as severity
            options.assignee = extractOptions('assignee');
            options.leadingTeam = extractOptions('leadingTeam');
            options.system = extractOptions('system');
            options.sprint = extractOptions('sprintName');
            options.regression = extractOptions('regression');
            
            console.log('📊 Filter options extracted:', {
                status: options.status.length,
                severity: options.severity.length, 
                assignee: options.assignee.length,
                leadingTeam: options.leadingTeam.length,
                system: options.system.length,
                sprint: options.sprint.length,
                regression: options.regression.length
            });
            
            return options;
        }

    // Event handling for UI updates
    onDataChanged(callback) {
        this._dataChangeCallback = callback;
    }

    onError(callback) {
        this._errorCallback = callback;
    }

    notifyDataChanged(type) {
        if (this._dataChangeCallback) {
            this._dataChangeCallback(type, this.getState());
        }
    }

    notifyError(message, error) {
        if (this._errorCallback) {
            this._errorCallback(message, error);
        }
    }

    // Manual refresh
    async refresh() {
        console.log('🔄 Manual refresh requested...');
        await this.performFullSync();
    }

    // Get cache info for debugging
    getCacheInfo() {
        return this.cache.getCacheInfo();
    }
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.BugDataManager = BugDataManager;
}

// Export for Node.js
if (typeof module !== 'undefined') {
    module.exports = { BugDataManager };
}