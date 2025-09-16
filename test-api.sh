#!/bin/bash

# Test script for Express Async Rate Cache API
# Make sure the server is running on port 3000 before running this script

API_BASE="http://localhost:3000"

echo "🧪 Testing Express Async Rate Cache API"
echo "========================================"

echo
echo "1. Testing API Documentation endpoint..."
curl -s "$API_BASE/" | jq '.name, .endpoints'

echo
echo "2. Testing Health Check..."
curl -s "$API_BASE/health" | jq '.data.status'

echo
echo "3. Testing GET /users/1 (cache miss - should take ~200ms)..."
time curl -s "$API_BASE/users/1" | jq '.data.name, .cached, .responseTime'

echo
echo "4. Testing GET /users/1 again (cache hit - should be fast)..."
time curl -s "$API_BASE/users/1" | jq '.data.name, .cached, .responseTime'

echo
echo "5. Testing GET /users/2..."
curl -s "$API_BASE/users/2" | jq '.data.name, .cached'

echo
echo "6. Testing GET /users/999 (non-existent user)..."
curl -s "$API_BASE/users/999" | jq '.success, .error'

echo
echo "7. Testing POST /users (create new user)..."
curl -s -X POST "$API_BASE/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com"}' | jq '.data.name, .data.id'

echo
echo "8. Testing cache status..."
curl -s "$API_BASE/cache-status" | jq '.data.cache.hits, .data.cache.misses, .data.cache.currentSize'

echo
echo "9. Testing concurrent requests for same user (should batch)..."
curl -s "$API_BASE/users/3" &
curl -s "$API_BASE/users/3" &
curl -s "$API_BASE/users/3" &
wait

echo
echo "10. Testing rate limiting (sending 12 requests quickly)..."
for i in {1..12}; do
  echo "Request $i:"
  curl -s "$API_BASE/users/1" | jq '.success, .error // empty' | head -1
done

echo
echo "11. Testing DELETE /cache..."
curl -s -X DELETE "$API_BASE/cache" | jq '.success, .data.message'

echo
echo "12. Final cache status after clearing..."
curl -s "$API_BASE/cache-status" | jq '.data.cache.hits, .data.cache.misses, .data.cache.currentSize'

echo
echo "✅ API testing completed!"
echo "Check the server logs for detailed processing information."
