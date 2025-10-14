package menu

import (
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type MenuUpdater struct {
	menuService  *MenuService
	cacheService *MenuCacheService
	retryCount   int
	retryDelay   time.Duration
}

func NewMenuUpdater(menuService *MenuService, cacheService *MenuCacheService) *MenuUpdater {
	return &MenuUpdater{
		menuService:  menuService,
		cacheService: cacheService,
		retryCount:   3,
		retryDelay:   5 * time.Minute,
	}
}

func (u *MenuUpdater) UpdateAll() error {
	logger.Info("Starting scheduled menu update for all cafeterias")

	// Clear cache first
	u.cacheService.ClearAll()

	// Update both cafeterias
	var wg sync.WaitGroup
	errChan := make(chan error, 2)

	wg.Add(2)

	go func() {
		defer wg.Done()
		if err := u.updateCafeteria(PEONY); err != nil {
			errChan <- fmt.Errorf("Peony update failed: %w", err)
		}
	}()

	go func() {
		defer wg.Done()
		if err := u.updateCafeteria(AZILEA); err != nil {
			errChan <- fmt.Errorf("Azilea update failed: %w", err)
		}
	}()

	wg.Wait()
	close(errChan)

	// Collect errors
	var errors []error
	for err := range errChan {
		errors = append(errors, err)
		logger.ErrorErr("Cafeteria update failed", err)
	}

	if len(errors) > 0 {
		return fmt.Errorf("update completed with %d errors", len(errors))
	}

	logger.Info("All menus updated successfully")
	return nil
}

func (u *MenuUpdater) updateCafeteria(cafeteria Cafeteria) error {
	var lastErr error

	for attempt := 1; attempt <= u.retryCount; attempt++ {
		if attempt > 1 {
			logger.InfoWithFields("Retry attempt",
				slog.Int("attempt", attempt),
				slog.String("cafeteria", string(cafeteria)))
			time.Sleep(u.retryDelay)
		}

		_, err := u.menuService.getMenu(cafeteria)
		if err == nil {
			logger.InfoWithFields("Successfully updated",
				slog.String("cafeteria", string(cafeteria)))
			return nil
		}

		lastErr = err
		logger.ErrorErrWithFields("Update attempt failed", err,
			slog.Int("attempt", attempt),
			slog.String("cafeteria", string(cafeteria)))
	}

	return lastErr
}
