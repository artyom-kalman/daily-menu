package menu

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

type MenuScheduler struct {
	updater   *MenuUpdater
	clock     Clock
	location  *time.Location
	isRunning bool
	mu        sync.RWMutex
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

func NewMenuScheduler(updater *MenuUpdater, clock Clock) *MenuScheduler {
	if clock == nil {
		clock = NewKSTClock()
	}

	ctx, cancel := context.WithCancel(context.Background())
	now := clock.Now()
	location := now.Location()
	if location == nil {
		location = time.FixedZone("KST", 9*60*60)
	}

	return &MenuScheduler{
		updater:  updater,
		clock:    clock,
		location: location,
		ctx:      ctx,
		cancel:   cancel,
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
	slog.Info("Menu scheduler started",
		"run_time", "06:00",
		"timezone", s.location.String())

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
			if err := s.updater.UpdateAll(s.ctx); err != nil {
				slog.Error("Scheduled update failed", "error", err)
			}
		}
	}
}

func (s *MenuScheduler) warmup() {
	slog.Info("Starting service warmup")

	ctx := s.ctx

	go func() {
		if err := s.updater.UpdateCafeteria(ctx, PEONY); err != nil {
			slog.Error("Failed to warmup Peony menu", "error", err)
		}
	}()

	go func() {
		if err := s.updater.UpdateCafeteria(ctx, AZILEA); err != nil {
			slog.Error("Failed to warmup Azilea menu", "error", err)
		}
	}()

	slog.Info("Service warmup initiated")
}

func (s *MenuScheduler) getNextRunTime() time.Time {
	now := s.clock.Now().In(s.location)

	// Get today at 6:00 AM KST
	today6AM := time.Date(now.Year(), now.Month(), now.Day(), 6, 0, 0, 0, s.location)

	// If today's 6:00 AM has passed, schedule for tomorrow
	if now.After(today6AM) {
		return today6AM.Add(24 * time.Hour)
	}

	return today6AM
}
