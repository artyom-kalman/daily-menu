package config

import (
	"context"
	"fmt"
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
		logger.Info("application already initialized, skipping")
		return nil
	}

	logger.Info("initializing application with database path: %s", dbSourcePath)

	ctx, cancel := context.WithTimeout(ctx, initTimeout)
	defer cancel()

	config, err := loadAppConfig(peonyUrl, azileaUrl, dbSourcePath)
	if err != nil {
		logger.Error("failed to load application config: %v", err)
		return fmt.Errorf("config loading failed: %w", err)
	}

	services, err := initializeServices(ctx, config)
	if err != nil {
		logger.Error("failed to initialize services: %v", err)
		return fmt.Errorf("service initialization failed: %w", err)
	}

	if err := warmupServices(ctx, services); err != nil {
		logger.Error("service warmup failed (continuing anyway): %v", err)
	}

	cacheMenuService = services
	isInitialized = true

	logger.Info("application initialization completed successfully")
	return nil
}

func loadAppConfig(peonyUrl, azileaUrl, dbSourcePath string) (*AppConfig, error) {
	logger.Debug("loading application configuration")

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

	logger.Debug("application config loaded successfully")
	return config, nil
}

func initializeServices(ctx context.Context, config *AppConfig) (*menu.MenuService, error) {
	logger.Debug("initializing services")

	logger.Debug("creating ChatGPT service")
	gptService := ai.NewGptService(config.GPTToken, config.GPTURL)

	logger.Debug("creating menu fetcher services for Peony and Azilea")
	peonyFetcher := menu.NewMenuFetcherService(config.PeonyURL, gptService)
	azileaFetcher := menu.NewMenuFetcherService(config.AzileaURL, gptService)

	logger.Debug("initializing database with path: %s", config.DBSourcePath)
	db := database.NewDatabase(config.DBSourcePath)
	menuRepo := menu.NewMenuRepository(db)

	logger.Debug("creating core services")
	cacheService := menu.NewMenuCacheService()
	persistenceService := menu.NewMenuPersistenceService(menuRepo)

	logger.Debug("creating orchestration services")
	peonyOrchestration := menu.NewCafeteriaService(cacheService, persistenceService, peonyFetcher)
	azileaOrchestration := menu.NewCafeteriaService(cacheService, persistenceService, azileaFetcher)

	logger.Debug("creating combined menu service")
	menuService := menu.NewMenuService(peonyOrchestration, azileaOrchestration)

	logger.Info("all services initialized successfully")
	return menuService, nil
}

func warmupServices(ctx context.Context, menuService *menu.MenuService) error {
	logger.Info("starting service warmup")

	errChan := make(chan error, 2)
	var wg sync.WaitGroup

	wg.Add(2)

	go func() {
		defer wg.Done()
		logger.Debug("warming up Azilea menu service")
		if _, err := menuService.GetAzileaMenu(); err != nil {
			logger.Error("failed to warmup Azilea menu: %v", err)
			errChan <- fmt.Errorf("Azilea warmup failed: %w", err)
			return
		}
		logger.Debug("Azilea menu warmup completed")
	}()

	go func() {
		defer wg.Done()
		logger.Debug("warming up Peony menu service")
		if _, err := menuService.GetPeonyMenu(); err != nil {
			logger.Error("failed to warmup Peony menu: %v", err)
			errChan <- fmt.Errorf("Peony warmup failed: %w", err)
			return
		}
		logger.Debug("Peony menu warmup completed")
	}()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-ctx.Done():
		logger.Error("service warmup cancelled due to context timeout")
		return ctx.Err()
	case err := <-errChan:
		logger.Error("service warmup completed with errors: %v", err)
		return err
	case <-done:
		logger.Info("service warmup completed successfully")
		return nil
	}
}

func MenuService() (*menu.MenuService, error) {
	initMutex.RLock()
	defer initMutex.RUnlock()

	if !isInitialized || cacheMenuService == nil {
		logger.Error("attempted to get menu service before initialization")
		return nil, fmt.Errorf("menu service is not initialized - call InitApp first")
	}

	logger.Debug("returning initialized menu service")
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

	logger.Info("shutting down application services")
	cacheMenuService = nil
	isInitialized = false
	logger.Info("application shutdown completed")
}
