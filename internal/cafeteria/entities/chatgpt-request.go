package entities

type GPTRequest struct {
	Model    string     `json:"model"`
	Messages []*Message `json:"messages"`
	Stream   bool       `json:"stream"`
	MaxToken int        `json:"max_token"`
}
