#!/bin/bash

# Test script for Express Async Rate Cache API
# Make sure the server is running on port 3000 before running this script

API_BASE="http://localhost:3000"

echo "Testing Express Async Rate Cache API"
echo "========================================"

echo
echo "1. Testing API Documentation endpoint..."
curl -s "$API_BASE/" | jq '.name, .endpoints'
sleep 1

echo
echo "2. Testing Health Check..."
curl -s "$API_BASE/health" | jq '.data.status'
sleep 1

echo
echo "3. Testing GET /users/1 (cache miss - should take ~200ms)..."
time curl -s "$API_BASE/users/1" | jq '.data.name, .cached, .responseTime'
sleep 1

echo
echo "4. Testing GET /users/1 again (cache hit - should be fast)..."
time curl -s "$API_BASE/users/1" | jq '.data.name, .cached, .responseTime'
sleep 1

echo
echo "5. Testing GET /users/2..."
curl -s "$API_BASE/users/2" | jq '.data.name, .cached'
sleep 6

echo
echo "6. Testing GET /users/999 (non-existent user)..."
curl -s "$API_BASE/users/999" | jq '.success, .error'
sleep 1

echo
echo "7. Testing POST /users (create new user)..."
curl -s -X POST "$API_BASE/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com"}' | jq '.data.name, .data.id'
sleep 1

echo
echo "8. Testing cache status..."
curl -s "$API_BASE/cache/status" | jq '.data.cache.hits, .data.cache.misses, .data.cache.currentSize'

echo "Waiting 48 seconds to reset rate limit..."
sleep 48

echo
echo "9. Testing concurrent requests for same user (should batch)..."
curl -s "$API_BASE/users/3" &
curl -s "$API_BASE/users/3" &
curl -s "$API_BASE/users/3" &
wait
sleep 1

echo
echo "10. Testing DELETE /cache..."
curl -s -X DELETE "$API_BASE/cache" | jq '.success, .data.message'
sleep 1

echo
echo "11. Final cache status after clearing..."
curl -s "$API_BASE/cache/status" | jq '.data.cache.hits, .data.cache.misses, .data.cache.currentSize'
sleep 8

echo
echo "12. Testing rate limiting (should show 429 errors after 5 requests)..."
echo "Sending 8 rapid requests (burst limit is 5 per 10 seconds and the window is 10 requests per minute)..."
for i in {1..8}; do
  echo -n "Request $i: "
  response=$(curl -s -w "%{http_code}" "$API_BASE/users/1")
  http_code="${response: -3}"
  if [ "$http_code" = "429" ]; then
    echo "Rate limited (429)"
  elif [ "$http_code" = "200" ]; then
    echo "Success (200)"
  else
    echo "HTTP $http_code"
  fi
done

echo
echo "API testing completed!"
echo "Check the server logs for detailed processing information."
