# Stage 1: Build the Go binary
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Download dependencies
COPY go.mod ./
RUN go mod download

# Copy source and build
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o gateway main.go

# Stage 2: Minimal runtime image
FROM alpine:latest

WORKDIR /app
COPY --from=builder /app/gateway .

EXPOSE 8080

CMD ["./gateway"]
