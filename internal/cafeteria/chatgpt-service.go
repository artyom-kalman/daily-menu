package cafeteria

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria/entities"
)

const MENU_PROMPT = "Опиши эти корейские блюда. Для каждого блюда напиши одно предложение. Также напиши степень остроты блюда. Вот список блюд: "

func AddDescriptionToMenu(menu *entities.Menu) error {
	for _, item := range menu.Items {
		item.Description = "Суповая версия ттокпокки с острыми рисовыми клецками в бульоне."
	}
	return nil
}

func formMenuPrompt(menu *entities.Menu) string {
	question := strings.Clone(MENU_PROMPT)
	for _, item := range menu.Items {
		question += fmt.Sprintf("%s, ", item.Name)
	}
	return question
}

func sendRequest(prompt string) (*entities.GPTResponse, error) {
	apiKey := os.Getenv("OPEN_AI_API_KEY")
	if apiKey == "" {
		return nil, errors.New("set env key for openai")
	}

	reqBody := entities.GPTRequest{
		Model: "gpt-4",
		Messages: []*entities.Message{{
			Role:    "user",
			Content: prompt,
		}},
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
