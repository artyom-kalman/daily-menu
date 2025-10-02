package menu

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type CafeteriaService struct {
	cache       *MenuCacheService
	persistence *MenuPersistenceService
	fetcher     *MenuFetcherService
}

func NewCafeteriaService(cache *MenuCacheService, persistence *MenuPersistenceService, fetcher *MenuFetcherService) *CafeteriaService {
	return &CafeteriaService{
		cache:       cache,
		persistence: persistence,
		fetcher:     fetcher,
	}
}

func (s *CafeteriaService) GetMenu(cafeteria Cafeteria) (*Menu, error) {
	logger.Debug("getting menu for cafeteria: %s", string(cafeteria))

	// Check cache first
	if menu, exists := s.cache.Get(cafeteria); exists {
		logger.Debug("returning cached menu for %s", string(cafeteria))
		return menu, nil
	}

	// Check database
	logger.Debug("cached menu not available, checking database for %s", string(cafeteria))
	menu, err := s.persistence.LoadMenu(cafeteria)
	if err != nil {
		return nil, err
	}

	if menu != nil {
		logger.Info("found menu in database for %s with %d dishes", string(cafeteria), len(menu.Items))
		s.cache.Set(cafeteria, menu)
		return menu, nil
	}

	// Fetch from external source
	logger.Info("no menu found in database for %s, fetching from external source", string(cafeteria))
	menu, err = s.fetcher.FetchMenu()
	if err != nil {
		logger.Error("failed to fetch menu from external source for %s: %v", string(cafeteria), err)
		return nil, fmt.Errorf("menu fetch failed for %s: %w", string(cafeteria), err)
	}

	logger.Info("successfully fetched menu for %s with %d items", string(cafeteria), len(menu.Items))

	// Save to database and cache
	logger.Debug("updating database with new menu for %s", string(cafeteria))
	if err := s.persistence.SaveMenu(cafeteria, menu); err != nil {
		logger.Error("failed to update database with new menu for %s: %v", string(cafeteria), err)
		return nil, fmt.Errorf("database update failed for %s: %w", string(cafeteria), err)
	}

	s.cache.Set(cafeteria, menu)
	logger.Info("successfully updated database and cached menu for %s", string(cafeteria))
	return menu, nil
}

type MenuService struct {
	services map[Cafeteria]*CafeteriaService
}

func NewMenuService(peonyService, azileaService *CafeteriaService) *MenuService {
	services := map[Cafeteria]*CafeteriaService{
		PEONY:  peonyService,
		AZILEA: azileaService,
	}
	return &MenuService{
		services: services,
	}
}

func (s *MenuService) GetPeonyMenu() (*Menu, error) {
	return s.getMenu(PEONY)
}

func (s *MenuService) GetAzileaMenu() (*Menu, error) {
	return s.getMenu(AZILEA)
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

func (s *MenuService) getMenu(cafeteria Cafeteria) (*Menu, error) {
	services, exists := s.services[cafeteria]
	if !exists {
		return nil, fmt.Errorf("no services configured for cafeteria: %s", string(cafeteria))
	}

	return services.GetMenu(cafeteria)
}
