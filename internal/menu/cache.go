package menu

import (
	"sync"
	"time"
)

const (
	cacheTTL = 24 * time.Hour
)

type CachedMenu struct {
	menu      *Menu
	expiresAt time.Time
}

type MenuCacheService struct {
	cache map[Cafeteria]*CachedMenu
	mu    sync.RWMutex
}

func NewMenuCacheService() *MenuCacheService {
	return &MenuCacheService{
		cache: make(map[Cafeteria]*CachedMenu),
	}
}

func (c *MenuCacheService) Get(cafeteria Cafeteria) (*Menu, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	cached, exists := c.cache[cafeteria]
	if !exists {
		return nil, false
	}

	if time.Now().After(cached.expiresAt) {
		return nil, false
	}

	return cached.menu, true
}

func (c *MenuCacheService) Set(cafeteria Cafeteria, menu *Menu) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.cache[cafeteria] = &CachedMenu{
		menu:      menu,
		expiresAt: time.Now().Add(cacheTTL),
	}
}

func (c *MenuCacheService) Clear(cafeteria Cafeteria) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.cache, cafeteria)
}

func (c *MenuCacheService) ClearAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache = make(map[Cafeteria]*CachedMenu)
}
