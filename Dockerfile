FROM golang:1.23

WORKDIR /app/daily-menu/

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o app cmd/main.go

EXPOSE 3030

ENTRYPOINT ["./app"]
