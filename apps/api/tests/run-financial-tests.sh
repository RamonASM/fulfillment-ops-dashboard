#!/bin/bash

# Financial Features Test Runner
# Run this script to execute comprehensive financial feature tests

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║        FINANCIAL FEATURES COMPREHENSIVE TEST SUITE            ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Starting test execution..."
echo ""

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from /apps/api directory"
  exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
  echo "⚠️  Warning: .env file not found. Database connection may fail."
fi

# Run the test suite
tsx tests/financial-test.ts

# Capture exit code
TEST_EXIT_CODE=$?

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed!"
  echo ""
  echo "📄 Test report generated at:"
  echo "   tests/reports/financial-features-test-report.md"
else
  echo "❌ Some tests failed (exit code: $TEST_EXIT_CODE)"
  echo ""
  echo "📄 Check the test report for details:"
  echo "   tests/reports/financial-features-test-report.md"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"

exit $TEST_EXIT_CODE
