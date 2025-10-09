// Daily Menu App - Minimal JavaScript for enhanced UX
class DailyMenuApp {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateDateTime();
        this.setupSearch();
        this.setupFilters();
        this.setupCopyButtons();
        this.setupDarkMode();
        this.setupScrollToTop();
        this.setupPrint();
        this.setupCafeteriaToggles();
        
        // Update time every minute
        setInterval(() => this.updateDateTime(), 60000);
    }

    setupEventListeners() {
        // DOM is ready, setup all interactions
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Daily Menu App initialized');
        });
    }

    updateDateTime() {
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeOptions = { hour: '2-digit', minute: '2-digit' };
        
        const dateStr = now.toLocaleDateString('en-US', dateOptions);
        const timeStr = now.toLocaleTimeString('en-US', timeOptions);
        
        const dateElement = document.getElementById('currentDate');
        const lastUpdatedElement = document.getElementById('lastUpdated');
        
        if (dateElement) {
            dateElement.textContent = dateStr;
        }
        
        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = timeStr;
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const menuItems = document.querySelectorAll('.menu-item');
            
            menuItems.forEach(item => {
                const name = item.dataset.name?.toLowerCase() || '';
                const description = item.querySelector('p')?.textContent.toLowerCase() || '';
                
                if (name.includes(searchTerm) || description.includes(searchTerm)) {
                    item.style.display = 'block';
                    item.classList.add('animate-fade-in');
                } else {
                    item.style.display = 'none';
                }
            });

            this.showEmptyState(searchTerm);
        });
    }

    setupFilters() {
        const filterButtons = document.querySelectorAll('#spicinessFilter .filter-chip');
        if (!filterButtons.length) return;

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Update active state
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                const spiceLevel = button.dataset.spice;
                this.filterBySpiciness(spiceLevel);
            });
        });
    }

    filterBySpiciness(level) {
        const menuItems = document.querySelectorAll('.menu-item');
        
        menuItems.forEach(item => {
            const itemSpice = parseInt(item.dataset.spice) || 0;
            let show = false;

            if (level === 'all') {
                show = true;
            } else if (level === '3+') {
                show = itemSpice >= 3;
            } else {
                show = itemSpice === parseInt(level);
            }

            if (show) {
                item.style.display = 'block';
                item.classList.add('animate-fade-in');
            } else {
                item.style.display = 'none';
            }
        });
    }

    setupCopyButtons() {
        const copyButtons = document.querySelectorAll('.copy-btn');
        if (!copyButtons.length) return;

        copyButtons.forEach(button => {
            button.addEventListener('click', () => {
                const dishName = button.dataset.dish;
                this.copyToClipboard(dishName);
            });
        });
    }

    copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast(`Copied: ${text}`, 'success');
            }).catch(() => {
                this.fallbackCopy(text);
            });
        } else {
            this.fallbackCopy(text);
        }
    }

    fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showToast(`Copied: ${text}`, 'success');
        } catch (err) {
            this.showToast('Failed to copy', 'error');
        }
        
        document.body.removeChild(textArea);
    }

    setupDarkMode() {
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (!darkModeToggle) return;

        // Check for saved preference or system preference
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
            document.documentElement.classList.add('dark');
        }

        darkModeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            this.showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'info');
        });
    }

    setupScrollToTop() {
        const scrollButton = document.getElementById('scrollToTop');
        if (!scrollButton) return;

        scrollButton.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        // Show/hide button based on scroll position
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                scrollButton.classList.add('animate-fade-in');
            } else {
                scrollButton.classList.remove('animate-fade-in');
            }
        });
    }

    setupPrint() {
        const printButton = document.getElementById('printBtn');
        if (!printButton) return;

        printButton.addEventListener('click', () => {
            window.print();
            this.showToast('Print dialog opened', 'info');
        });
    }

    setupCafeteriaToggles() {
        const toggleButtons = document.querySelectorAll('.cafeteria-toggle');
        if (!toggleButtons.length) return;

        toggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                const cafeteria = button.dataset.cafeteria;
                const content = document.querySelector(`.cafeteria-content[data-cafeteria="${cafeteria}"]`);
                const icon = button.querySelector('svg');
                
                if (content) {
                    content.classList.toggle('hidden');
                    icon.classList.toggle('rotate-180');
                }
            });
        });
    }

    showEmptyState(searchTerm) {
        const visibleItems = document.querySelectorAll('.menu-item:not([style*="display: none"])');
        const existingEmptyState = document.querySelector('.empty-state');
        
        if (visibleItems.length === 0 && searchTerm) {
            if (!existingEmptyState) {
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-state text-center py-12 col-span-2';
                emptyState.innerHTML = `
                    <div class="text-gray-400">
                        <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p class="text-lg font-medium">No dishes found</p>
                        <p class="text-sm mt-2">Try searching for something else</p>
                    </div>
                `;
                
                const menuGrid = document.querySelector('.grid.gap-8');
                if (menuGrid) {
                    menuGrid.appendChild(emptyState);
                }
            }
        } else if (existingEmptyState) {
            existingEmptyState.remove();
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast mb-2 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 
            'bg-gray-800'
        }`;
        toast.textContent = message;

        container.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('animate-fade-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize the app
const app = new DailyMenuApp();

// Add some utility functions
window.DailyMenuApp = {
    showToast: (message, type) => app.showToast(message, type),
    copyToClipboard: (text) => app.copyToClipboard(text)
};