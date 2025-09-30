package menu

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/ai"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

type AIService interface {
	SendRequest(messages []*ai.Message) (any, error)
}

type MenuAIService struct {
	ai AIService
}

func NewMenuAIService(gptService AIService) *MenuAIService {
	return &MenuAIService{
		ai: gptService,
	}
}

func (s *MenuAIService) GenerateDescriptions(menu *Menu) error {
	messages := []*ai.Message{
		{Role: "system", Content: `Ты — генератор описаний для блюд.
Всегда отвечай только в формате JSON-массива:
[
  {"name": "корейское название", "description": "русское название"},
  ...
]
Не добавляй никакого текста, комментариев или пояснений.
Никаких приветствий, пояснений и Markdown-блоков — только JSON.`},
		{Role: "user", Content: s.generatePrompt(menu)},
	}

	response, err := s.ai.SendRequest(messages)
	if err != nil {
		return err
	}

	respStr, ok := response.(string)
	if !ok {
		return errors.New("AIService returned non-string response")
	}

	items, err := s.ParseMenuItems(respStr)
	if err != nil {
		logger.Error("failed to parse AI response: %v\nResponse: %s", err, respStr)
		return err
	}

	menu.Items = items
	return nil
}

func (s *MenuAIService) generatePrompt(menu *Menu) string {
	var b strings.Builder
	b.WriteString("Сгенерируй JSON-массив с описанием блюд.\n")
	b.WriteString("Формат ответа: [{\"name\": \"корейское название\", \"description\": \"название на русском\"}]\n")
	b.WriteString("Никакого текста кроме JSON.\n\n")
	b.WriteString("Список блюд:\n")

	for _, item := range menu.Items {
		b.WriteString("- " + item.Name + "\n")
	}

	return b.String()
}

func (s *MenuAIService) ParseMenuItems(response string) ([]*MenuItem, error) {
	jsonString := s.cleanJSONResponse(response)

	var items []*MenuItem
	if err := json.Unmarshal([]byte(jsonString), &items); err != nil {
		return nil, err
	}

	logger.Debug("parsed %d menu items from JSON", len(items))
	return items, nil
}

func (s *MenuAIService) cleanJSONResponse(response string) string {
	re := regexp.MustCompile("(?s)```json(.*?)```")
	if matches := re.FindStringSubmatch(response); len(matches) == 2 {
		response = matches[1]
	}

	response = strings.TrimSpace(response)
	return response
}
