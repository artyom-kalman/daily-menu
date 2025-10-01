FROM golang:1.24-alpine

RUN apk add --no-cache gcc musl-dev

WORKDIR /app
COPY go.mod go.sum ./

RUN go mod download

COPY . .

RUN GOOS=linux go build -o app cmd/main.go

EXPOSE 3030

CMD ["./app"]
