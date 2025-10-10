package menu

import (
	"fmt"
	"log/slog"

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
	// Check cache first
	if menu, exists := s.cache.Get(cafeteria); exists {
		return menu, nil
	}

	// Check database
	menu, err := s.persistence.LoadMenu(cafeteria)
	if err != nil {
		return nil, err
	}

	if menu != nil {
		logger.InfoWithFields("Found menu in database",
			slog.String("cafeteria", string(cafeteria)),
			slog.Int("dish_count", len(menu.Items)))
		s.cache.Set(cafeteria, menu)
		return menu, nil
	}

	// Fetch from external source
	logger.InfoWithFields("Fetching fresh menu from external source",
		slog.String("cafeteria", string(cafeteria)))
	menu, err = s.fetcher.FetchMenu()
	if err != nil {
		logger.ErrorErrWithFields("Failed to fetch menu from external source", err,
			slog.String("cafeteria", string(cafeteria)))
		return nil, fmt.Errorf("menu fetch failed for %s: %w", string(cafeteria), err)
	}

	logger.InfoWithFields("Successfully fetched menu",
		slog.String("cafeteria", string(cafeteria)),
		slog.Int("item_count", len(menu.Items)))

	// Save to database and cache
	if err := s.persistence.SaveMenu(cafeteria, menu); err != nil {
		logger.ErrorErrWithFields("Failed to update database with new menu", err,
			slog.String("cafeteria", string(cafeteria)))
		return nil, fmt.Errorf("database update failed for %s: %w", string(cafeteria), err)
	}

	s.cache.Set(cafeteria, menu)
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

func (s *MenuService) GetMenus() (*Menu, *Menu, error) {
	peony, err := s.GetPeonyMenu()
	if err != nil {
		return nil, nil, err
	}

	azilea, err := s.GetAzileaMenu()
	if err != nil {
		return nil, nil, err
	}

	return peony, azilea, nil
}

func (s *MenuService) getMenu(cafeteria Cafeteria) (*Menu, error) {
	services, exists := s.services[cafeteria]
	if !exists {
		return nil, fmt.Errorf("no services configured for cafeteria: %s", string(cafeteria))
	}

	return services.GetMenu(cafeteria)
}
