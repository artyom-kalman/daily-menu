package menu

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

type MenuScheduler struct {
	updater     *MenuUpdater
	kstLocation *time.Location
	isRunning   bool
	mu          sync.RWMutex
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
}

func NewMenuScheduler(updater *MenuUpdater) *MenuScheduler {
	kst, _ := time.LoadLocation("Asia/Seoul")
	ctx, cancel := context.WithCancel(context.Background())
	return &MenuScheduler{
		updater:     updater,
		kstLocation: kst,
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (s *MenuScheduler) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return nil
	}

	s.wg.Add(1)
	go s.runScheduler()
	s.isRunning = true
	slog.Info("Menu scheduler started - daily updates at 6:00 AM KST")

	go s.warmup()
	return nil
}

func (s *MenuScheduler) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return nil
	}

	s.cancel()
	s.wg.Wait()
	s.isRunning = false
	slog.Info("Menu scheduler stopped")
	return nil
}

func (s *MenuScheduler) runScheduler() {
	defer s.wg.Done()

	for {
		nextRun := s.getNextRunTime()
		timer := time.NewTimer(time.Until(nextRun))

		select {
		case <-s.ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			slog.Info("Starting scheduled menu update")
			if err := s.updater.UpdateAll(); err != nil {
				slog.Error("Scheduled update failed", "error", err)
			}
		}
	}
}

func (s *MenuScheduler) warmup() {
	slog.Info("Starting service warmup")

	go func() {
		if err := s.updater.UpdateCafeteria(PEONY); err != nil {
			slog.Error("Failed to warmup Peony menu", "error", err)
		}
	}()

	go func() {
		if err := s.updater.UpdateCafeteria(AZILEA); err != nil {
			slog.Error("Failed to warmup Azilea menu", "error", err)
		}
	}()

	slog.Info("Service warmup initiated")
}

func (s *MenuScheduler) getNextRunTime() time.Time {
	now := time.Now().In(s.kstLocation)

	// Get today at 6:00 AM KST
	today6AM := time.Date(now.Year(), now.Month(), now.Day(), 6, 0, 0, 0, s.kstLocation)

	// If today's 6:00 AM has passed, schedule for tomorrow
	if now.After(today6AM) {
		return today6AM.Add(24 * time.Hour)
	}

	return today6AM
}
