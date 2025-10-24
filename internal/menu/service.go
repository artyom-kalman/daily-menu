package menu

import (
	"context"
	"fmt"
	"log/slog"
	"maps"
)

type MenuService struct {
	persistence *MenuPersistenceService
	fetchers    map[Cafeteria]*MenuFetcherService
}

func NewMenuService(persistence *MenuPersistenceService, fetchers map[Cafeteria]*MenuFetcherService) *MenuService {
	fetchersCopy := make(map[Cafeteria]*MenuFetcherService, len(fetchers))
	maps.Copy(fetchersCopy, fetchers)

	return &MenuService{
		persistence: persistence,
		fetchers:    fetchersCopy,
	}
}

func (s *MenuService) GetMenuWithContext(ctx context.Context, cafeteria Cafeteria) (*Menu, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	menu, err := s.persistence.LoadMenu(cafeteria)
	if err != nil {
		return nil, err
	}

	if menu != nil {
		slog.Info("Found menu in database",
			"cafeteria", string(cafeteria),
			"dish_count", len(menu.Items))
		return menu, nil
	}

	if err := ctx.Err(); err != nil {
		return nil, err
	}

	return s.RefreshMenuWithContext(ctx, cafeteria)
}

func (s *MenuService) GetMenu(cafeteria Cafeteria) (*Menu, error) {
	return s.GetMenuWithContext(context.Background(), cafeteria)
}

func (s *MenuService) RefreshMenu(cafeteria Cafeteria) (*Menu, error) {
	return s.RefreshMenuWithContext(context.Background(), cafeteria)
}

func (s *MenuService) RefreshMenuWithContext(ctx context.Context, cafeteria Cafeteria) (*Menu, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	fetcher, ok := s.fetchers[cafeteria]
	if !ok {
		return nil, fmt.Errorf("no fetcher configured for cafeteria: %s", string(cafeteria))
	}

	slog.Info("Fetching fresh menu from external source",
		"cafeteria", string(cafeteria))

	menu, err := fetcher.FetchMenuWithContext(ctx)
	if err != nil {
		slog.Error("Failed to fetch menu from external source",
			"error", err,
			"cafeteria", string(cafeteria))
		return nil, fmt.Errorf("menu fetch failed for %s: %w", string(cafeteria), err)
	}

	slog.Info("Successfully fetched menu",
		"cafeteria", string(cafeteria),
		"item_count", len(menu.Items))

	if err := s.persistence.SaveMenu(cafeteria, menu); err != nil {
		slog.Error("Failed to update database with new menu",
			"error", err,
			"cafeteria", string(cafeteria))
		return nil, fmt.Errorf("database update failed for %s: %w", string(cafeteria), err)
	}

	return menu, nil
}

func (s *MenuService) GetPeonyMenu() (*Menu, error) {
	return s.GetMenu(PEONY)
}

func (s *MenuService) GetAzileaMenu() (*Menu, error) {
	return s.GetMenu(AZILEA)
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
