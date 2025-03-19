package chatgpt

type Request struct {
	Messages []*Message `json:"messages"`
}
