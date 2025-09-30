package menu

import (
	"fmt"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type MenuOrchestrationService struct {
	cacheService       *MenuCacheService
	persistenceService *MenuPersistenceService
	fetcherService     *MenuFetcherService
}

func NewMenuOrchestrationService(cache *MenuCacheService, persistence *MenuPersistenceService, fetcher *MenuFetcherService) *MenuOrchestrationService {
	return &MenuOrchestrationService{
		cacheService:       cache,
		persistenceService: persistence,
		fetcherService:     fetcher,
	}
}

func (s *MenuOrchestrationService) GetMenu(cafeteria Cafeteria) (*Menu, error) {
	logger.Debug("getting menu for cafeteria: %s", string(cafeteria))

	// Check cache first
	if menu, exists := s.cacheService.Get(cafeteria); exists {
		logger.Debug("returning cached menu for %s", string(cafeteria))
		return menu, nil
	}

	// Check database
	logger.Debug("cached menu not available, checking database for %s", string(cafeteria))
	menu, err := s.persistenceService.LoadMenu(cafeteria)
	if err != nil {
		return nil, err
	}

	if menu != nil {
		logger.Info("found menu in database for %s with %d dishes", string(cafeteria), len(menu.Items))
		s.cacheService.Set(cafeteria, menu)
		return menu, nil
	}

	// Fetch from external source
	logger.Info("no menu found in database for %s, fetching from external source", string(cafeteria))
	menu, err = s.fetcherService.FetchMenu()
	if err != nil {
		logger.Error("failed to fetch menu from external source for %s: %v", string(cafeteria), err)
		return nil, fmt.Errorf("menu fetch failed for %s: %w", string(cafeteria), err)
	}

	logger.Info("successfully fetched menu for %s with %d items", string(cafeteria), len(menu.Items))

	// Save to database and cache
	logger.Debug("updating database with new menu for %s", string(cafeteria))
	if err := s.persistenceService.SaveMenu(cafeteria, menu); err != nil {
		logger.Error("failed to update database with new menu for %s: %v", string(cafeteria), err)
		return nil, fmt.Errorf("database update failed for %s: %w", string(cafeteria), err)
	}

	s.cacheService.Set(cafeteria, menu)
	logger.Info("successfully updated database and cached menu for %s", string(cafeteria))
	return menu, nil
}
