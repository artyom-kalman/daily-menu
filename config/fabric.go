package config

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/ai"
	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

const (
	initTimeout = 30 * time.Second
)

var (
	cacheMenuService *menu.MenuService
	initMutex        sync.RWMutex
	isInitialized    bool
)

type AppConfig struct {
	DBSourcePath string
	PeonyURL     string
	AzileaURL    string
	GPTToken     string
	GPTURL       string
}

func InitApp(dbSourcePath string, peonyUrl string, azileaUrl string) error {
	return InitAppWithContext(context.Background(), dbSourcePath, peonyUrl, azileaUrl)
}

func InitAppWithContext(ctx context.Context, dbSourcePath string, peonyUrl string, azileaUrl string) error {
	initMutex.Lock()
	defer initMutex.Unlock()

	if isInitialized {
		logger.Info("Application already initialized, skipping")
		return nil
	}

	logger.InfoWithFields("Initializing application",
		slog.String("database_path", dbSourcePath))

	ctx, cancel := context.WithTimeout(ctx, initTimeout)
	defer cancel()

	config, err := loadAppConfig(peonyUrl, azileaUrl, dbSourcePath)
	if err != nil {
		logger.ErrorErr("Failed to load application config", err)
		return fmt.Errorf("config loading failed: %w", err)
	}

	services, err := initializeServices(ctx, config)
	if err != nil {
		logger.ErrorErr("Failed to initialize services", err)
		return fmt.Errorf("service initialization failed: %w", err)
	}

	if err := warmupServices(ctx, services); err != nil {
		logger.ErrorErr("Service warmup failed (continuing anyway)", err)
	}

	cacheMenuService = services
	isInitialized = true

	logger.Info("Application initialization completed successfully")
	return nil
}

func loadAppConfig(peonyUrl, azileaUrl, dbSourcePath string) (*AppConfig, error) {
	gptToken, err := GetEnv("GPT_TOKEN")
	if err != nil {
		return nil, fmt.Errorf("failed to get GPT_TOKEN: %w", err)
	}

	gptUrl, err := GetEnv("GPT_URL")
	if err != nil {
		return nil, fmt.Errorf("failed to get GPT_URL: %w", err)
	}

	config := &AppConfig{
		DBSourcePath: dbSourcePath,
		PeonyURL:     peonyUrl,
		AzileaURL:    azileaUrl,
		GPTToken:     gptToken,
		GPTURL:       gptUrl,
	}

	return config, nil
}

func initializeServices(ctx context.Context, config *AppConfig) (*menu.MenuService, error) {
	gptService := ai.NewGptService(config.GPTToken, config.GPTURL)
	peonyFetcher := menu.NewMenuFetcherService(config.PeonyURL, gptService)
	azileaFetcher := menu.NewMenuFetcherService(config.AzileaURL, gptService)

	db := database.NewDatabase(config.DBSourcePath)
	menuRepo := menu.NewMenuRepository(db)

	cacheService := menu.NewMenuCacheService()
	persistenceService := menu.NewMenuPersistenceService(menuRepo)

	peonyOrchestration := menu.NewCafeteriaService(cacheService, persistenceService, peonyFetcher)
	azileaOrchestration := menu.NewCafeteriaService(cacheService, persistenceService, azileaFetcher)

	menuService := menu.NewMenuService(peonyOrchestration, azileaOrchestration)

	logger.Info("All services initialized successfully")
	return menuService, nil
}

func warmupServices(ctx context.Context, menuService *menu.MenuService) error {
	logger.Info("Starting service warmup")

	errChan := make(chan error, 2)
	var wg sync.WaitGroup

	wg.Add(2)

	go func() {
		defer wg.Done()
		if _, err := menuService.GetAzileaMenu(); err != nil {
			logger.ErrorErr("Failed to warmup Azilea menu", err)
			errChan <- fmt.Errorf("Azilea warmup failed: %w", err)
			return
		}
	}()

	go func() {
		defer wg.Done()
		if _, err := menuService.GetPeonyMenu(); err != nil {
			logger.ErrorErr("Failed to warmup Peony menu", err)
			errChan <- fmt.Errorf("Peony warmup failed: %w", err)
			return
		}
	}()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-ctx.Done():
		logger.Error("Service warmup cancelled due to context timeout")
		return ctx.Err()
	case err := <-errChan:
		logger.ErrorErr("Service warmup completed with errors", err)
		return err
	case <-done:
		logger.Info("Service warmup completed successfully")
		return nil
	}
}

func MenuService() (*menu.MenuService, error) {
	initMutex.RLock()
	defer initMutex.RUnlock()

	if !isInitialized || cacheMenuService == nil {
		logger.Error("Attempted to get menu service before initialization")
		return nil, fmt.Errorf("menu service is not initialized - call InitApp first")
	}

	return cacheMenuService, nil
}

func IsInitialized() bool {
	initMutex.RLock()
	defer initMutex.RUnlock()
	return isInitialized
}

func Shutdown() {
	initMutex.Lock()
	defer initMutex.Unlock()

	if !isInitialized {
		return
	}

	logger.Info("Shutting down application services")
	cacheMenuService = nil
	isInitialized = false
	logger.Info("Application shutdown completed")
}
