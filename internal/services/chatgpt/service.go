package chatgpt

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
)

type GptService struct {
	apiKey string
	model  string
	url    string
}

func NewChatGPTService(apiKey string, model string, url string) *GptService {
	return &GptService{
		apiKey: apiKey,
		model:  model,
		url:    url,
	}
}

func (gpt *GptService) SendRequest(prompt string) ([]*domain.MenuItem, error) {
	reqBody := GPTRequest{
		Model: gpt.model,
		Messages: []*GptMessage{
			{
				Role:    "user",
				Content: prompt,
			},
		},
		MaxToken: 1024,
		Stream:   false,
	}

	reqBodyJson, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(
		"POST",
		gpt.url,
		bytes.NewBuffer(reqBodyJson),
	)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+gpt.apiKey)

	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != 200 && res.StatusCode != 201 {
		body, _ := io.ReadAll(res.Body)
		return nil, errors.New(fmt.Sprintf("Bad request to AI: %s", body))
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}

	var gptResponse GPTResponse
	err = json.Unmarshal(body, &gptResponse)
	if err != nil {
		return nil, err
	}

	return ParseRespond(gptResponse.Choices[0].Message.Content)
}
