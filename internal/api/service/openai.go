package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/api/entities"
)

const MENU_PROMPT = "Опиши эти корейские блюда. Для каждого блюда напиши одно предложение. Также напиши степень остроты блюда. Вот список блюд: "

func AddDescriptionToMenu(menu *entities.Menu) {
	for _, item := range menu.Items {
		item.Name = "Токпоки"
		item.Description = "Суповая версия ттокпокки с острыми рисовыми клецками в бульоне."
	}
}

func formMenuPrompt(menu *entities.Menu) string {
	question := strings.Clone(MENU_PROMPT)
	for _, item := range menu.Items {
		question += fmt.Sprintf("%s, ", item.Name)
	}
	return question
}

func sendRequest(question string) (*entities.GPTResponse, error) {
	apiKey := os.Getenv("OPEN_AI_API_KEY")

	reqBody := entities.GPTRequest{
		Model: "gpt-4",
		Message: &entities.Message{
			Role:    "user",
			Content: question,
		},
	}

	reqBodyJson, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		"POST",
		"https://api.openai.com/v1/chat/completions",
		bytes.NewBuffer(reqBodyJson),
	)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var resBody entities.GPTResponse
	err = json.Unmarshal(body, &resBody)
	if err != nil {
		return nil, err
	}

	return &resBody, nil
}
