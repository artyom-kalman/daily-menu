package menu

import (
	"encoding/json"
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
	menuPrompt := s.generatePrompt(menu)
	messages := []*ai.Message{
		{Role: "system", Content: "Ты - полезный помощник для генерации описаний меню."},
		{Role: "user", Content: menuPrompt},
	}

	response, err := s.ai.SendRequest(messages)
	if err != nil {
		return err
	}

	items, err := s.ParseMenuItems(response.(string))
	if err != nil {
		return err
	}

	menu.Items = items
	return nil
}

func (s *MenuAIService) generatePrompt(menu *Menu) string {
	menuPrompt := "Опиши блюда. В ответе отправь только json без какой-либо дополнительной информации: name: название на корейском, description: название на русском"
	for _, item := range menu.Items {
		menuPrompt += item.Name + ", "
	}
	return menuPrompt
}

func (s *MenuAIService) ParseMenuItems(response string) ([]*MenuItem, error) {
	jsonString := s.cleanJSONResponse(response)

	var items []*MenuItem
	err := json.Unmarshal([]byte(jsonString), &items)
	if err != nil {
		return nil, err
	}

	logger.Debug("parsed %d menu items from JSON", len(items))
	return items, nil
}

func (s *MenuAIService) cleanJSONResponse(response string) string {
	jsonString := strings.ReplaceAll(response, "\n", "")
	jsonString = strings.ReplaceAll(jsonString, "\t", "")
	return jsonString
}
