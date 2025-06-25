FROM golang:1.24
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN GOOS=linux go build -o app cmd/main.go
EXPOSE 80
CMD ["./app"]
