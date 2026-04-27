// Bug Cache Manager - Handles browser caching and incremental sync
class BugCache {
    constructor() {
        this.CACHE_KEY = 'hibob_bugs_cache';
        this.FILTER_STATE_KEY = 'hibob_filter_state';
        this.LAST_SYNC_KEY = 'hibob_last_sync';
        this.CACHE_VERSION = '1.0';
    }

    // Get cached lightweight bugs data
    getCachedBugs() {
        try {
            const cached = localStorage.getItem(this.CACHE_KEY);
            if (!cached) return null;
            
            const data = JSON.parse(cached);
            if (data.version !== this.CACHE_VERSION) {
                console.log('🗑️ Cache version mismatch, clearing cache');
                this.clearCache();
                return null;
            }
            
            console.log(`📦 Found cached bugs: ${data.bugs.length} bugs, last sync: ${new Date(data.lastSync).toLocaleString()}`);
            return data;
        } catch (error) {
            console.error('❌ Error reading cache:', error);
            this.clearCache();
            return null;
        }
    }

    // Save lightweight bugs data to cache
    saveBugsToCache(bugs, metadata = {}) {
        try {
            const cacheData = {
                version: this.CACHE_VERSION,
                bugs: this.normalizeBugsForCache(bugs),
                metadata: {
                    ...metadata,
                    totalBugs: bugs.length,
                    cachedAt: new Date().toISOString()
                },
                lastSync: new Date().toISOString()
            };
            
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
            localStorage.setItem(this.LAST_SYNC_KEY, cacheData.lastSync);
            
            console.log(`💾 Cached ${bugs.length} bugs to localStorage`);
            return true;
        } catch (error) {
            console.error('❌ Error saving to cache:', error);
            // Handle quota exceeded
            if (error.name === 'QuotaExceededError') {
                console.log('🧹 Storage quota exceeded, clearing cache');
                this.clearCache();
            }
            return false;
        }
    }

    // Normalize bugs data for efficient caching (remove heavy fields)
    normalizeBugsForCache(bugs) {
        return bugs.map(bug => ({
            // Core identification
            id: bug.key, // Use key as id
            key: bug.key,
            project: bug.project || 'BT',
            
            // Display fields  
            summary: bug.summary || '',
            
            // Status and workflow
            status: bug.status || 'Unknown',
            priority: bug.priority || 'Medium',
            
            // Dates (lightweight)
            created: bug.created,
            updated: bug.updated,
            createdDate: bug.createdDate,
            updatedDate: bug.updatedDate,
            daysOpen: bug.daysOpen,
            
            // Assignment and teams
            assignee: bug.assignee || 'Unassigned',
            reporter: bug.reporter || 'Unknown',
            leadingTeam: bug.leadingTeam || null,
            involvedTeams: bug.involvedTeams || [],
            
            // Technical fields
            system: bug.system || null,
            sprintId: bug.sprintId || null,
            sprintName: bug.sprint || null, // Using sprint as sprintName
            
            // Classification
            severity: bug.severity || null,
            bugType: bug.bugType || null,
            regression: bug.regression || null,
            
            // Metadata
            labels: bug.labels || [],
            components: bug.components || [],
            
            // Derived fields
            isOpen: this.isOpenStatus(bug.status),
            
            // Exclude heavy fields (description, comments, changelog, etc.)
            // These will be loaded on-demand via /api/bugs/:id/details
        }));
    }

    // Determine if bug status means it's still open
    isOpenStatus(status) {
        const closedStatuses = ['deployed', 'rejected', 'canceled', 'cancelled', 'closed', 'done', 'resolved'];
        return !closedStatuses.includes((status || '').toLowerCase());
    }

    // Get last sync timestamp
    getLastSync() {
        return localStorage.getItem(this.LAST_SYNC_KEY);
    }

    // Update bugs cache with incremental data
    updateCache(updatedBugs, removedBugKeys = []) {
        const cached = this.getCachedBugs();
        if (!cached) {
            console.warn('⚠️ No existing cache to update');
            return false;
        }

        try {
            // Create a map for efficient lookups
            const bugMap = new Map(cached.bugs.map(bug => [bug.key, bug]));
            
            // Update/add bugs
            const normalized = this.normalizeBugsForCache(updatedBugs);
            normalized.forEach(bug => {
                bugMap.set(bug.key, bug);
            });
            
            // Remove deleted bugs
            removedBugKeys.forEach(key => {
                bugMap.delete(key);
            });
            
            // Convert back to array
            const updatedBugsList = Array.from(bugMap.values());
            
            // Save updated cache
            this.saveBugsToCache(updatedBugsList, cached.metadata);
            
            console.log(`🔄 Cache updated: ${updatedBugs.length} updated, ${removedBugKeys.length} removed, ${updatedBugsList.length} total`);
            return true;
            
        } catch (error) {
            console.error('❌ Error updating cache:', error);
            return false;
        }
    }

    // Save filter and sort state
    saveFilterState(filterState, sortState) {
        try {
            const state = {
                filters: filterState,
                sort: sortState,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem(this.FILTER_STATE_KEY, JSON.stringify(state));
            console.log('💾 Filter state saved');
        } catch (error) {
            console.error('❌ Error saving filter state:', error);
        }
    }

    // Restore filter and sort state
    restoreFilterState() {
        try {
            const saved = localStorage.getItem(this.FILTER_STATE_KEY);
            if (!saved) return null;
            
            const state = JSON.parse(saved);
            console.log(`📋 Restored filter state from ${new Date(state.savedAt).toLocaleString()}`);
            return state;
        } catch (error) {
            console.error('❌ Error restoring filter state:', error);
            return null;
        }
    }

    // Clear all cached data
    clearCache() {
        localStorage.removeItem(this.CACHE_KEY);
        localStorage.removeItem(this.FILTER_STATE_KEY);
        localStorage.removeItem(this.LAST_SYNC_KEY);
        console.log('🗑️ Cache cleared');
    }

    // Get cache info for debugging
    getCacheInfo() {
        const cached = this.getCachedBugs();
        const filterState = this.restoreFilterState();
        const lastSync = this.getLastSync();
        
        return {
            hasCachedBugs: !!cached,
            bugCount: cached?.bugs?.length || 0,
            lastSync: lastSync ? new Date(lastSync).toLocaleString() : 'Never',
            hasFilterState: !!filterState,
            cacheSize: this.calculateCacheSize()
        };
    }

    // Calculate approximate cache size
    calculateCacheSize() {
        const cached = localStorage.getItem(this.CACHE_KEY);
        const filterState = localStorage.getItem(this.FILTER_STATE_KEY);
        
        let size = 0;
        if (cached) size += new Blob([cached]).size;
        if (filterState) size += new Blob([filterState]).size;
        
        return `${Math.round(size / 1024)}KB`;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined') {
    module.exports = { BugCache };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.BugCache = BugCache;
}