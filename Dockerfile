FROM golang:1.21-alpine

RUN apk add npm sqlite gcc g++

WORKDIR /app

COPY / /app/
RUN go mod download

WORKDIR /app/public

RUN npm run build:css

WORKDIR /app/cmd

RUN CGO_ENABLED=1 go build -o ./server

EXPOSE 3000

WORKDIR /app

CMD ["./cmd/server"]
