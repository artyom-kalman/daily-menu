package menu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"

	"github.com/artyom-kalman/kbu-daily-menu/internal/ai"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type AIService interface {
	SendRequest(ctx context.Context, messages []*ai.Message) (any, error)
}

type MenuAIService struct {
	ai AIService
}

func NewMenuAIService(gptService AIService) *MenuAIService {
	return &MenuAIService{
		ai: gptService,
	}
}

func (s *MenuAIService) GenerateDescriptions(ctx context.Context, menu *Menu) error {
	var wg sync.WaitGroup
	errChan := make(chan error, len(menu.Items))
	semaphore := make(chan struct{}, 3) // Limit concurrent requests

	for i, item := range menu.Items {
		wg.Add(1)
		go func(index int, menuItem *MenuItem) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			parsedItem, err := s.parseSingleItem(ctx, menuItem)
			if err != nil {
				errChan <- fmt.Errorf("failed to parse item '%s': %w", menuItem.Name, err)
				return
			}

			menuItem.Description = parsedItem.Description
			menuItem.Spiciness = parsedItem.Spiciness
		}(i, item)
	}

	wg.Wait()
	close(errChan)

	var errs []string
	for err := range errChan {
		errs = append(errs, err.Error())
	}

	if len(errs) > 0 {
		return fmt.Errorf("encountered %d errors: %s", len(errs), strings.Join(errs, "; "))
	}

	return nil
}

func (s *MenuAIService) parseSingleItem(ctx context.Context, item *MenuItem) (*MenuItem, error) {
	messages := []*ai.Message{
		{Role: "system", Content: `Ты — генератор ужасных и зловещих описаний блюд для Хэллоуина. Отвечай только на русском языке.
Описание должно состоять максимум из 2 предложений и вызывать жуткие ассоциации, но оставаться аппетитным.

Всегда отвечай строго в формате JSON:
{
  "name": "название блюда",
  "description": "короткое страшное описание блюда на русском языке",
  "spiciness": число от 0 до 5
}

Правила:
- Не добавляй никакой вводной информации, пояснений, комментариев или Markdown-блоков.
- Не используй лишние пробелы или переносы строк вне JSON.`},
		{Role: "user", Content: fmt.Sprintf("Сгенерируй описание для блюда: %s", item.Name)},
	}

	response, err := s.ai.SendRequest(ctx, messages)
	if err != nil {
		return nil, err
	}

	respStr, ok := response.(string)
	if !ok {
		return nil, errors.New("AIService returned non-string response")
	}

	parsedItem, err := s.ParseSingleItem(respStr)
	if err != nil {
		logger.ErrorErrWithFields("Failed to parse AI response for menu item", err,
			slog.String("item_name", item.Name),
			slog.String("response", respStr))
		return nil, err
	}

	return parsedItem, nil
}

func (s *MenuAIService) ParseSingleItem(response string) (*MenuItem, error) {
	jsonString := s.cleanJSONResponse(response)

	var item MenuItem
	if err := json.Unmarshal([]byte(jsonString), &item); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON: %w", err)
	}

	return &item, nil
}

func (s *MenuAIService) ValidateMenu(ctx context.Context, menu *Menu) (*MenuValidationResponse, error) {
	menuText := s.formatMenuForValidation(menu)

	messages := []*ai.Message{
		{Role: "system", Content: `Ты — ассистент для проверки меню столовой. Проанализируй меню и определи, является ли оно полноценным дневным меню.

Критерии валидного меню:
- Минимум 3 блюда
- Разнообразие категорий (не только гарниры или закуски)

Примеры НЕВАЛИДНЫХ меню:
- "Только салат" - is_valid: false, message: "Меню слишком бедное, добавьте горячие блюда"
- "Чай, кофе, бутерброд" - is_valid: false, message: "Недостаточно полноценных блюд для обеда"
- "" (пустое) - is_valid: false, message: "Меню на сегодня отсутствует"

Отвечай строго в формате JSON:
{
  "is_valid": true/false,
  "message": "текст для отображения пользователю на русском",
  "reason": "краткое объяснение на русском"
}

Правила:
- Если меню полноценное по критериям выше - is_valid: true, message можно оставить пустым
- Если меню недостаточное - is_valid: false с дружелюбным сообщением
- Будь гибче в оценке - лучше одобрить меню с 2-3 блюдами, чем отклонить нормальное меню`},
		{Role: "user", Content: fmt.Sprintf("Проверь меню на сегодня: %s", menuText)},
	}

	response, err := s.ai.SendRequest(ctx, messages)
	if err != nil {
		return nil, err
	}

	respStr, ok := response.(string)
	if !ok {
		return nil, errors.New("AIService returned non-string response")
	}

	return s.parseValidationResponse(respStr)
}

func (s *MenuAIService) parseValidationResponse(response string) (*MenuValidationResponse, error) {
	jsonString := s.cleanJSONResponse(response)

	var validation MenuValidationResponse
	if err := json.Unmarshal([]byte(jsonString), &validation); err != nil {
		return nil, fmt.Errorf("failed to unmarshal validation response: %w", err)
	}

	return &validation, nil
}

func (s *MenuAIService) formatMenuForValidation(menu *Menu) string {
	if len(menu.Items) == 0 {
		return "Пустое меню"
	}

	var items []string
	for _, item := range menu.Items {
		items = append(items, item.Name)
	}
	return fmt.Sprintf("Блюда (%d): %s", len(items), strings.Join(items, ", "))
}

func (s *MenuAIService) cleanJSONResponse(response string) string {
	re := regexp.MustCompile("(?s)```json(.*?)```")
	if matches := re.FindStringSubmatch(response); len(matches) == 2 {
		response = matches[1]
	}

	response = strings.TrimSpace(response)

	// Fix incomplete JSON by adding missing closing brace if needed
	if !strings.HasSuffix(response, "}") && strings.Contains(response, "{") {
		response += "}"
	}

	return response
}
