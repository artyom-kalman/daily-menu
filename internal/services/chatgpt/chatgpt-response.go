package chatgpt

type GPTResponse struct {
	Choices []*Choice `json:"choices"`
}

type Choice struct {
	Message GptMessage `json:"message"`
}
