package menu

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type MenuService struct {
	peonyCache        *MenuCacheService
	azileaCache       *MenuCacheService
	peonyPersistence  *MenuPersistenceService
	azileaPersistence *MenuPersistenceService
	peonyFetcher      *MenuFetcherService
	azileaFetcher     *MenuFetcherService
}

func NewMenuService(peonyCache, azileaCache *MenuCacheService, peonyPersistence, azileaPersistence *MenuPersistenceService, peonyFetcher, azileaFetcher *MenuFetcherService) *MenuService {
	return &MenuService{
		peonyCache:        peonyCache,
		azileaCache:       azileaCache,
		peonyPersistence:  peonyPersistence,
		azileaPersistence: azileaPersistence,
		peonyFetcher:      peonyFetcher,
		azileaFetcher:     azileaFetcher,
	}
}

func (s *MenuService) GetPeonyMenu() (*Menu, error) {
	return s.getMenu(PEONY, s.peonyCache, s.peonyPersistence, s.peonyFetcher)
}

func (s *MenuService) GetAzileaMenu() (*Menu, error) {
	return s.getMenu(AZILEA, s.azileaCache, s.azileaPersistence, s.azileaFetcher)
}

func (s *MenuService) GetMenuString() (string, error) {
	peony, err := s.GetPeonyMenu()
	if err != nil {
		return "", err
	}

	azilea, err := s.GetAzileaMenu()
	if err != nil {
		return "", nil
	}

	menu := fmt.Sprintf("Вот меню на сегодня.\nPeony (нижняя):\n%s\nAzilea (вехняя):\n%s", peony.String(), azilea.String())
	return menu, nil
}

func (s *MenuService) getMenu(cafeteria Cafeteria, cache *MenuCacheService, persistence *MenuPersistenceService, fetcher *MenuFetcherService) (*Menu, error) {
	logger.Debug("getting menu for cafeteria: %s", string(cafeteria))

	// Check cache first
	if menu, exists := cache.Get(cafeteria); exists {
		logger.Debug("returning cached menu for %s", string(cafeteria))
		return menu, nil
	}

	// Check database
	logger.Debug("cached menu not available, checking database for %s", string(cafeteria))
	menu, err := persistence.LoadMenu(cafeteria)
	if err != nil {
		return nil, err
	}

	if menu != nil {
		logger.Info("found menu in database for %s with %d dishes", string(cafeteria), len(menu.Items))
		cache.Set(cafeteria, menu)
		return menu, nil
	}

	// Fetch from external source
	logger.Info("no menu found in database for %s, fetching from external source", string(cafeteria))
	menu, err = fetcher.FetchMenu()
	if err != nil {
		logger.Error("failed to fetch menu from external source for %s: %v", string(cafeteria), err)
		return nil, fmt.Errorf("menu fetch failed for %s: %w", string(cafeteria), err)
	}

	logger.Info("successfully fetched menu for %s with %d items", string(cafeteria), len(menu.Items))

	// Save to database and cache
	logger.Debug("updating database with new menu for %s", string(cafeteria))
	if err := persistence.SaveMenu(cafeteria, menu); err != nil {
		logger.Error("failed to update database with new menu for %s: %v", string(cafeteria), err)
		return nil, fmt.Errorf("database update failed for %s: %w", string(cafeteria), err)
	}

	cache.Set(cafeteria, menu)
	logger.Info("successfully updated database and cached menu for %s", string(cafeteria))
	return menu, nil
}
