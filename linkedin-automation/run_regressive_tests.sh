#!/bin/bash
# Regressive Testing Script for LinkedIn Automation
# This script runs all critical tests to verify the LinkedIn automation works correctly

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================================"
echo "LINKEDIN AUTOMATION - REGRESSIVE TEST SUITE"
echo "============================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "linkedin_outreach.py" ]; then
    echo -e "${RED}❌ Error: linkedin_outreach.py not found${NC}"
    echo "   Please run this script from the inb/ directory"
    exit 1
fi

# Test 1: Python syntax check
echo -e "${YELLOW}[TEST 1/7] Checking Python syntax...${NC}"
if python3 -m py_compile linkedin_outreach.py; then
    echo -e "${GREEN}✅ Python syntax check passed${NC}"
else
    echo -e "${RED}❌ Python syntax check failed${NC}"
    exit 1
fi
echo ""

# Test 2: Import verification
echo -e "${YELLOW}[TEST 2/7] Verifying imports...${NC}"
if python3 -c "import linkedin_outreach; print('Imports OK')"; then
    echo -e "${GREEN}✅ Import verification passed${NC}"
else
    echo -e "${RED}❌ Import verification failed${NC}"
    echo "   Run: pip install -r requirements.txt"
    exit 1
fi
echo ""

# Test 3: Dependencies check
echo -e "${YELLOW}[TEST 3/7] Checking dependencies...${NC}"
DEPS_OK=true
for pkg in selenium pandas openpyxl undetected-chromedriver; do
    if python3 -c "import ${pkg//-/_}" 2>/dev/null; then
        echo "  ✅ $pkg"
    else
        echo -e "  ${RED}❌ $pkg${NC}"
        DEPS_OK=false
    fi
done

if [ "$DEPS_OK" = true ]; then
    echo -e "${GREEN}✅ All dependencies installed${NC}"
else
    echo -e "${RED}❌ Missing dependencies${NC}"
    echo "   Run: pip install -r requirements.txt"
    exit 1
fi
echo ""

# Test 4: Configuration check
echo -e "${YELLOW}[TEST 4/7] Checking configuration...${NC}"
if python3 -c "
import linkedin_outreach as lo
assert lo.DAILY_LIMIT == 25, f'DAILY_LIMIT should be 25, got {lo.DAILY_LIMIT}'
assert hasattr(lo, 'QUOTA_FILE'), 'QUOTA_FILE not defined'
assert hasattr(lo, 'RESUME_LINK'), 'RESUME_LINK not defined'
assert hasattr(lo, 'DEFAULT_MESSAGE'), 'DEFAULT_MESSAGE not defined'
assert len(lo.DEFAULT_MESSAGE) <= 300, f'DEFAULT_MESSAGE too long: {len(lo.DEFAULT_MESSAGE)} chars'
print('Configuration OK')
"; then
    echo -e "${GREEN}✅ Configuration check passed${NC}"
else
    echo -e "${RED}❌ Configuration check failed${NC}"
    exit 1
fi
echo ""

# Test 5: Automated test suite
echo -e "${YELLOW}[TEST 5/7] Running automated test suite...${NC}"
if [ -f "test_linkedin_automation.py" ]; then
    if python3 test_linkedin_automation.py --skip-driver; then
        echo -e "${GREEN}✅ Automated test suite passed${NC}"
    else
        echo -e "${RED}❌ Automated test suite failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Test suite not found (test_linkedin_automation.py)${NC}"
fi
echo ""

# Test 6: Excel file check
echo -e "${YELLOW}[TEST 6/7] Checking Excel file...${NC}"
if [ -f "linkedin-data.xlsx" ]; then
    if python3 -c "
import pandas as pd
df = pd.read_excel('linkedin-data.xlsx')
required = ['Name', 'Company Name', 'Linkedin URL', 'Status']
missing = [col for col in required if col not in df.columns]
if missing:
    print(f'Missing columns: {missing}')
    exit(1)
print(f'Excel file OK: {len(df)} rows')
"; then
        echo -e "${GREEN}✅ Excel file check passed${NC}"
    else
        echo -e "${RED}❌ Excel file check failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Excel file not found (linkedin-data.xlsx)${NC}"
fi
echo ""

# Test 7: Function existence check
echo -e "${YELLOW}[TEST 7/7] Checking critical functions...${NC}"
if python3 -c "
import linkedin_outreach as lo
functions = [
    'load_quota', 'save_quota', 'get_remaining_quota', 'increment_quota',
    'extract_public_id', 'load_profiles_from_excel', 'update_excel_status',
    'setup_driver', 'login_with_cookie', 'send_direct_message',
    '_handle_connect_modal'
]
missing = [f for f in functions if not hasattr(lo, f)]
if missing:
    print(f'Missing functions: {missing}')
    exit(1)
print('All functions defined')
"; then
    echo -e "${GREEN}✅ Function check passed${NC}"
else
    echo -e "${RED}❌ Function check failed${NC}"
    exit 1
fi
echo ""

# Summary
echo "============================================================"
echo -e "${GREEN}✅ ALL REGRESSIVE TESTS PASSED${NC}"
echo "============================================================"
echo ""
echo "Next steps for manual testing:"
echo "1. Get your LinkedIn cookie (li_at)"
echo "2. Run a test with --debug flag:"
echo "   python3 linkedin_outreach.py --cookie YOUR_COOKIE --limit 1 --debug"
echo "3. Verify connection request sent successfully"
echo "4. Check Excel file updated with status"
echo ""
echo "For detailed testing instructions, see:"
echo "  - MANUAL_TESTING_GUIDE.md"
echo "  - TESTING_GUIDE.md"
echo ""
echo "============================================================"
