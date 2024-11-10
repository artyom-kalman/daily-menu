package chatgpt

type GptMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
