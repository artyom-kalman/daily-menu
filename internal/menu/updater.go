package menu

import (
	"context"
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

func (u *MenuUpdater) UpdateAll(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}

	slog.Info("Starting scheduled menu update for all cafeterias")

	// Update both cafeterias
	var wg sync.WaitGroup
	errChan := make(chan error, 2)

	wg.Add(2)

	go func() {
		defer wg.Done()
		if err := u.updateCafeteria(ctx, PEONY); err != nil {
			errChan <- fmt.Errorf("Peony update failed: %w", err)
		}
	}()

	go func() {
		defer wg.Done()
		if err := u.updateCafeteria(ctx, AZILEA); err != nil {
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

func (u *MenuUpdater) UpdateCafeteria(ctx context.Context, cafeteria Cafeteria) error {
	return u.updateCafeteria(ctx, cafeteria)
}

func (u *MenuUpdater) updateCafeteria(ctx context.Context, cafeteria Cafeteria) error {
	if ctx == nil {
		ctx = context.Background()
	}

	var lastErr error

	for attempt := 1; attempt <= u.retryCount; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}

		if attempt > 1 {
			slog.Info("Retry attempt",
				"attempt", attempt,
				"cafeteria", string(cafeteria))
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(u.retryDelay):
			}
		}

		_, err := u.menuService.RefreshMenuWithContext(ctx, cafeteria)
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

	if err := ctx.Err(); err != nil {
		return err
	}

	return lastErr
}
