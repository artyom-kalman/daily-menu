package menu

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

type MenuUpdater struct {
	menuService *MenuService
	retryCount  int
	retryDelay  time.Duration
}

func NewMenuUpdater(menuService *MenuService) *MenuUpdater {
	return &MenuUpdater{
		menuService: menuService,
		retryCount:  3,
		retryDelay:  5 * time.Minute,
	}
}

func (u *MenuUpdater) UpdateAll() error {
	slog.Info("Starting scheduled menu update for all cafeterias")

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
		slog.Error("Cafeteria update failed", "error", err)
	}

	if len(errors) > 0 {
		return fmt.Errorf("update completed with %d errors", len(errors))
	}

	slog.Info("All menus updated successfully")
	return nil
}

func (u *MenuUpdater) UpdateCafeteria(cafeteria Cafeteria) error {
	return u.updateCafeteria(cafeteria)
}

func (u *MenuUpdater) updateCafeteria(cafeteria Cafeteria) error {
	var lastErr error

	for attempt := 1; attempt <= u.retryCount; attempt++ {
		if attempt > 1 {
			slog.Info("Retry attempt",
				"attempt", attempt,
				"cafeteria", string(cafeteria))
			time.Sleep(u.retryDelay)
		}

		_, err := u.menuService.RefreshMenu(cafeteria)
		if err == nil {
			slog.Info("Successfully updated",
				"cafeteria", string(cafeteria))
			return nil
		}

		lastErr = err
		slog.Error("Update attempt failed",
			"error", err,
			"attempt", attempt,
			"cafeteria", string(cafeteria))
	}

	return lastErr
}
