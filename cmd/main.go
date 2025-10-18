package main

import (
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/artyom-kalman/kbu-daily-menu/internal/ai"
	"github.com/artyom-kalman/kbu-daily-menu/internal/bot"
	"github.com/artyom-kalman/kbu-daily-menu/internal/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
	"github.com/artyom-kalman/kbu-daily-menu/internal/http"
	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

func main() {
	logger.Init()

	cfg, err := config.LoadConfig()
	if err != nil {
		slog.Error("Failed to load config", "err", err)
		os.Exit(1)
	}

	// Initialize database
	db, err := database.Init(cfg.DatabasePath, cfg.MigrationPath)
	if err != nil {
		slog.Error("Failed to initialize database", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	gptService := ai.NewGptService(cfg.GPTToken, cfg.GPTURL)
	peonyFetcher := menu.NewMenuFetcherService(cfg.PeonyURL, gptService)
	azileaFetcher := menu.NewMenuFetcherService(cfg.AzileaURL, gptService)

	menuRepo := menu.NewMenuRepository(db)
	cacheService := menu.NewMenuCacheService()
	persistenceService := menu.NewMenuPersistenceService(menuRepo)

	peonyOrchestration := menu.NewCafeteriaService(cacheService, persistenceService, peonyFetcher)
	azileaOrchestration := menu.NewCafeteriaService(cacheService, persistenceService, azileaFetcher)

	menuService := menu.NewMenuService(peonyOrchestration, azileaOrchestration)

	updater := menu.NewMenuUpdater(menuService, cacheService)
	scheduler := menu.NewMenuScheduler(updater)

	if err := scheduler.Start(); err != nil {
		slog.Error("Failed to start scheduler", "error", err)
		os.Exit(1)
	}

	botRepo := bot.NewSubscriptionRepository(db)
	botInstance, err := bot.NewBot(cfg.TelegramBotToken, botRepo, menuService)
	if err != nil {
		slog.Error("Failed to create bot", "err", err)
		os.Exit(1)
	}

	server := http.NewServer(scheduler, menuService)
	server.SetupRouter()

	errChan := make(chan error, 1)

	go func() {
		if err := botInstance.Run(); err != nil {
			errChan <- fmt.Errorf("bot failed to start: %w", err)
		}
	}()

	go func() {
		if err := server.Start(cfg.Port); err != nil {
			errChan <- fmt.Errorf("server failed to start: %w", err)
		}
	}()

	waitForShutdown(errChan, scheduler)
}

func waitForShutdown(errChan chan error, scheduler *menu.MenuScheduler) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errChan:
		slog.Error("Application failed", "err", err)
		os.Exit(1)
	case sig := <-quit:
		slog.Info("Received signal, shutting down", "signal", sig.String())
	}

	// Graceful shutdown
	slog.Info("Shutting down application")

	if scheduler != nil {
		if err := scheduler.Stop(); err != nil {
			slog.Error("Failed to stop scheduler", "error", err)
		}
	}

	slog.Info("Application shutdown completed")
}
