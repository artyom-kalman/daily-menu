package menu

import (
	"context"
	"fmt"
	"log/slog"
)

type MenuSource interface {
	FetchMenu(ctx context.Context) (*Menu, error)
}

type MenuValidator interface {
	Validate(ctx context.Context, menu *Menu) (*MenuValidationResponse, error)
}

type MenuEnricher interface {
	Enrich(ctx context.Context, menu *Menu) error
}

type MenuFetcherService struct {
	source    MenuSource
	validator MenuValidator
	enricher  MenuEnricher
	clock     Clock
}

func NewMenuFetcherService(url string, aiService AIService, clock Clock) *MenuFetcherService {
	if clock == nil {
		clock = NewKSTClock()
	}

	parser := NewMenuParser(url, clock)
	source := &parserMenuSource{parser: parser}

	aiProcessor := &aiMenuProcessor{service: NewMenuAIService(aiService)}

	return NewMenuFetcherPipeline(source, aiProcessor, aiProcessor, clock)
}

func NewMenuFetcherPipeline(source MenuSource, validator MenuValidator, enricher MenuEnricher, clock Clock) *MenuFetcherService {
	if source == nil {
		panic("menu source must not be nil")
	}

	if clock == nil {
		clock = NewKSTClock()
	}

	return &MenuFetcherService{
		source:    source,
		validator: validator,
		enricher:  enricher,
		clock:     clock,
	}
}

func (s *MenuFetcherService) FetchMenu() (*Menu, error) {
	return s.FetchMenuWithContext(context.Background())
}

func (s *MenuFetcherService) FetchMenuWithContext(ctx context.Context) (*Menu, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	menu, err := s.source.FetchMenu(ctx)
	if err != nil {
		slog.Error("Failed to fetch menu from source", "error", err)
		return nil, fmt.Errorf("failed to fetch menu: %w", err)
	}

	if s.validator != nil {
		validation, err := s.validator.Validate(ctx, menu)
		if err != nil {
			slog.Error("Failed to validate menu", "error", err)
			return s.handleValidationFailure(ctx, menu)
		}

		if !validation.IsValid {
			slog.Info("Menu validation failed", "reason", validation.Reason)
			return s.createEmptyMenu(validation.Message), nil
		}
	}

	if s.enricher != nil {
		if err := s.enricher.Enrich(ctx, menu); err != nil {
			slog.Error("Failed to enrich menu", "error", err)
			return nil, fmt.Errorf("failed to enrich menu: %w", err)
		}
	}

	slog.Debug("Successfully processed menu", "item_count", len(menu.Items))
	return menu, nil
}

func (s *MenuFetcherService) handleValidationFailure(ctx context.Context, menu *Menu) (*Menu, error) {
	if len(menu.Items) == 0 {
		return s.createEmptyMenu("Не удалось проверить меню"), nil
	}

	if s.enricher == nil {
		return menu, nil
	}

	if ctx == nil {
		ctx = context.Background()
	}

	if err := s.enricher.Enrich(ctx, menu); err != nil {
		slog.Error("Failed to enrich menu during fallback", "error", err)
		return s.createEmptyMenu("Ошибка при обработке меню"), nil
	}

	return menu, nil
}

func (s *MenuFetcherService) createEmptyMenu(message string) *Menu {
	if message == "" {
		message = "Сегодня меню недоступно"
	}

	now := s.clock.Now()
	return &Menu{
		Items: []*MenuItem{
			{
				Name:        message,
				Description: "",
				Spiciness:   0,
			},
		},
		Time: &now,
	}
}

type parserMenuSource struct {
	parser *MenuParser
}

func (p *parserMenuSource) FetchMenu(ctx context.Context) (*Menu, error) {
	return p.parser.ParseMenu(ctx)
}

type aiMenuProcessor struct {
	service *MenuAIService
}

func (p *aiMenuProcessor) Validate(ctx context.Context, menu *Menu) (*MenuValidationResponse, error) {
	return p.service.ValidateMenu(ctx, menu)
}

func (p *aiMenuProcessor) Enrich(ctx context.Context, menu *Menu) error {
	return p.service.GenerateDescriptions(ctx, menu)
}
