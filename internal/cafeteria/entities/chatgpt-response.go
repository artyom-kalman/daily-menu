package entities

type GPTResponse struct {
	Choices []*Choice `json:"choices"`
}

type Choice struct {
	Message Message `json:"message"`
}
