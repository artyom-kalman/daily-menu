package menu

import (
	"fmt"
	"sync"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/go-co-op/gocron"
)

type MenuScheduler struct {
	cron        *gocron.Scheduler
	updater     *MenuUpdater
	kstLocation *time.Location
	isRunning   bool
	mu          sync.RWMutex
}

func NewMenuScheduler(updater *MenuUpdater) *MenuScheduler {
	kst, _ := time.LoadLocation("Asia/Seoul")
	return &MenuScheduler{
		cron:        gocron.NewScheduler(time.UTC),
		updater:     updater,
		kstLocation: kst,
	}
}

func (s *MenuScheduler) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return nil
	}

	// Schedule daily at 6:00 AM KST
	_, err := s.cron.Cron("0 6 * * *").Tag("daily-update").Do(func() {
		logger.Info("Starting scheduled menu update")
		if err := s.updater.UpdateAll(); err != nil {
			logger.ErrorErr("Scheduled update failed", err)
		}
	})

	if err != nil {
		return fmt.Errorf("failed to schedule job: %w", err)
	}

	s.cron.StartAsync()
	s.isRunning = true
	logger.Info("Menu scheduler started - daily updates at 6:00 AM KST")
	return nil
}

func (s *MenuScheduler) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return nil
	}

	s.cron.Stop()
	s.isRunning = false
	logger.Info("Menu scheduler stopped")
	return nil
}
