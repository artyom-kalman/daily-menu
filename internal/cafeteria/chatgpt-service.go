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

const MENU_PROMPT = "Опиши блюда. Ответ дай в виде json: name: название на русском, description: описание, spiciness: степень остроты от 1 до 5. Вот список блюд: "

func AddDescriptionToMenu(menu *entities.Menu) error {
	prompt := generatePromtForMenu(menu)

	items, err := sendRequest(prompt)
	if err != nil {
		return err
	}

	menu.Items = items

	return nil
}

func generatePromtForMenu(menu *entities.Menu) string {
	question := strings.Clone(MENU_PROMPT)
	for _, item := range menu.Items {
		question += fmt.Sprintf("%s, ", item.Name)
	}
	return question
}

func sendRequest(prompt string) ([]*entities.MenuItem, error) {
	apiKey := os.Getenv("AIML_API_KEY")
	if apiKey == "" {
		return nil, errors.New("set env key for AI/ML")
	}

	reqBody := entities.GPTRequest{
		Model: "gpt-4o",
		Messages: []*entities.Message{{
			Role:    "user",
			Content: prompt,
		}},
		MaxToken: 1024,
		Stream:   false,
	}

	reqBodyJson, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		"POST",
		"https://api.aimlapi.com/chat/completions",
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

	if res.StatusCode != 200 && res.StatusCode != 201 {
		body, _ := io.ReadAll(res.Body)
		println(string(body))
		return nil, errors.New("Bad request")
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var gptResponse entities.GPTResponse
	err = json.Unmarshal(body, &gptResponse)
	if err != nil {
		return nil, err
	}

	return ParseRespons(gptResponse.Choices[0].Message.Content)
}

func ParseRespons(res string) ([]*entities.MenuItem, error) {
	// if !isReponseJson(res) {
	// 	return nil, errors.New("error parsing response from AI")
	// }

	jsonString := strings.ReplaceAll(res, "\n", "")
	jsonString = strings.ReplaceAll(jsonString, "\t", "")
	jsonString = jsonString[7 : len(jsonString)-3]
	println(jsonString)

	var items []*entities.MenuItem
	err := json.Unmarshal([]byte(jsonString), &items)
	if err != nil {
		return nil, err
	}

	return items, nil
}

func isReponseJson(rep string) bool {
	return strings.HasPrefix(rep, "```json") && strings.HasSuffix(rep, "```")
}
