package chatgpt

type GPTRequest struct {
	Model    string        `json:"model"`
	Messages []*GptMessage `json:"messages"`
	Stream   bool          `json:"stream"`
	MaxToken int           `json:"max_token"`
}
