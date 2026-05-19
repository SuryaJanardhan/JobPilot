# Manual Testing Guide for LinkedIn Automation

## Overview
This guide provides step-by-step instructions for performing manual and regressive testing of the LinkedIn automation functionality after fixing the merge conflicts.

## Prerequisites

1. **Python Dependencies**: Install required packages
   ```bash
   cd inb
   pip install -r requirements.txt
   ```

2. **LinkedIn Cookie**: Get your `li_at` cookie from LinkedIn
   - Login to LinkedIn in your browser
   - Open Developer Tools (F12)
   - Go to Application/Storage → Cookies → https://www.linkedin.com
   - Find and copy the `li_at` cookie value

3. **Excel File**: Ensure `linkedin-data.xlsx` exists with required columns:
   - Name
   - Company Name
   - Linkedin URL
   - Status
   - Delivered

## Test Suite 1: Automated Unit Tests

Run the automated test suite first to verify all functions work correctly:

```bash
cd inb
python3 test_linkedin_automation.py --skip-driver
```

**Expected Result**: All tests should pass (37/37)

## Test Suite 2: Driver and Selenium Tests

Test the WebDriver setup and basic browser automation:

```bash
cd inb
python3 test_linkedin_automation.py
```

**Expected Result**: All tests including driver tests should pass

## Test Suite 3: Manual Connection Request Testing

### Test 3.1: Dry Run with Debug Mode

Test the script without actually sending connection requests:

```bash
cd inb
python3 linkedin_outreach.py \
  --cookie "YOUR_LINKEDIN_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 1 \
  --debug \
  --headless
```

**What to Check:**
- ✅ Script starts without errors
- ✅ Authentication succeeds
- ✅ Profile loads correctly
- ✅ Debug output shows buttons found on the page
- ✅ Connect button is detected (Method 1-7)
- ✅ No syntax errors or crashes

**Expected Output Example:**
```
============================================================
🔗 LINKEDIN OUTREACH (Direct Messages)
============================================================
📊 Daily Quota: 0/25 used, 25 remaining
📁 Excel: linkedin-data.xlsx
🎯 Requested: 1

💬 Message (255 chars):
   Hi! I'm Surya, a Software Engineer with Full Stack, AI/ML & LLM expertise...

🔐 Authenticating...
   Using cookie auth...
✅ Authenticated!

[1/1] John Doe
  🏢 Company XYZ
  🔗 john-doe
  [DEBUG] Found 12 buttons on page
  [DEBUG] - Text: 'Connect' | Aria: 'Invite John Doe to connect'
  ✅ Message sent with connection request!
```

### Test 3.2: Single Connection Request

Send one actual connection request to verify end-to-end functionality:

```bash
cd inb
python3 linkedin_outreach.py \
  --cookie "YOUR_LINKEDIN_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 1
```

**What to Check:**
- ✅ Connection request sent successfully
- ✅ Message included with connection request
- ✅ Excel file updated with status "sent"
- ✅ Quota incremented correctly
- ✅ No errors in console

**Verify on LinkedIn:**
1. Go to "My Network" → "Manage" → "Sent"
2. Check that the connection request was sent
3. Verify the message was included

### Test 3.3: Already Connected Profile

Test with a profile you're already connected to:

```bash
# Manually edit linkedin-data.xlsx to include a connected profile
python3 linkedin_outreach.py \
  --cookie "YOUR_LINKEDIN_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 1 \
  --debug
```

**Expected Result:**
- Status should be `already_connected`
- Script should skip without error

### Test 3.4: Pending Connection Request

Test with a profile that already has a pending request:

**Expected Result:**
- Status should be `pending`
- Script should skip without error

### Test 3.5: Follow-Only Profile

Test with a profile that only allows "Follow" (not "Connect"):

**Expected Result:**
- Status should be `follow_only`
- Script should handle gracefully

## Test Suite 4: Regressive Testing

### Test 4.1: Multiple Connection Requests

Test sending multiple connection requests in sequence:

```bash
cd inb
python3 linkedin_outreach.py \
  --cookie "YOUR_LINKEDIN_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 3
```

**What to Check:**
- ✅ All 3 requests sent successfully
- ✅ Random delays between requests (5-12 seconds)
- ✅ Quota updated correctly (3/25)
- ✅ Excel file updated for all 3 profiles
- ✅ No rate limiting or blocking from LinkedIn

### Test 4.2: Quota Management

Test daily quota limits:

```bash
# Check current quota
cd inb
python3 -c "import linkedin_outreach as lo; print(lo.load_quota())"

# Try to exceed quota (simulate having sent 25 messages)
# Edit linkedin_quota.json to set sent: 25
python3 linkedin_outreach.py \
  --cookie "YOUR_LINKEDIN_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 10
```

**Expected Result:**
- Script should stop immediately
- Message: "⛔ Daily quota exhausted! Try again tomorrow."

### Test 4.3: Session Expiration Handling

Test with an expired or invalid cookie:

```bash
cd inb
python3 linkedin_outreach.py \
  --cookie "INVALID_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 1
```

**Expected Result:**
- Authentication fails
- Script exits gracefully with error message
- No profiles are processed

### Test 4.4: Excel File Handling

Test various Excel file scenarios:

**Test 4.4a: Missing Excel File**
```bash
cd inb
python3 linkedin_outreach.py \
  --cookie "YOUR_COOKIE" \
  --excel "nonexistent.xlsx" \
  --limit 1
```
**Expected**: Error message about missing file

**Test 4.4b: All Profiles Already Contacted**
- Mark all profiles as "sent" in Excel
- Run script
**Expected**: "✅ No unsent profiles found. All done!"

**Test 4.4c: Invalid LinkedIn URLs**
- Add profiles with invalid URLs to Excel
- Run script
**Expected**: Profiles skipped gracefully

### Test 4.5: Message Customization

Test custom message functionality:

```bash
cd inb
python3 linkedin_outreach.py \
  --cookie "YOUR_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 1 \
  --message "Custom test message for connection request"
```

**Expected Result:**
- Custom message used instead of default
- Message truncated to 300 chars if too long

### Test 4.6: Error Recovery

Test script behavior during errors:

**Test 4.6a: Network Interruption**
- Start script
- Disable network briefly during execution
**Expected**: Error logged, script continues with next profile

**Test 4.6b: Page Load Timeout**
- Test with very slow network
**Expected**: Timeout handled gracefully

**Test 4.6c: Modal Not Found**
- Test with profile where modal doesn't appear
**Expected**: Error logged as `modal_error`, continues

## Test Suite 5: UI Element Detection Tests

### Test 5.1: Connect Button Detection Methods

Verify all 7 methods for finding Connect button work:

```bash
cd inb
python3 linkedin_outreach.py \
  --cookie "YOUR_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 5 \
  --debug
```

**What to Check:**
- Debug output shows which method found the button
- Different profiles may use different methods
- All methods should work for current LinkedIn UI

**Expected Debug Output:**
```
[DEBUG] Found 15 buttons on page
[DEBUG] - Text: 'Connect' | Aria: 'Invite Jane Smith to connect'
[DEBUG] - Text: 'Follow' | Aria: ''
[DEBUG] - Text: 'More' | Aria: 'More actions'
```

### Test 5.2: Modal Button Detection

Test "Add a note" and "Send" button detection:

**What to Check:**
- "Add a note" button found and clicked
- Textarea for message found
- Message entered correctly
- "Send" button found and clicked

## Test Suite 6: Performance Testing

### Test 6.1: Timing and Delays

Verify timing is appropriate:

```bash
cd inb
time python3 linkedin_outreach.py \
  --cookie "YOUR_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 3
```

**What to Check:**
- Page load: 5-7 seconds
- Scroll delays: 1-1.5 seconds total
- Button click delay: 0.5 seconds
- Modal load: 2 seconds
- Between profiles: 5-12 seconds (random)
- Total for 3 profiles: ~40-60 seconds

### Test 6.2: Resource Usage

Monitor CPU and memory during execution:

```bash
cd inb
# In one terminal
top -p $(pgrep -f linkedin_outreach.py)

# In another terminal
python3 linkedin_outreach.py \
  --cookie "YOUR_COOKIE" \
  --excel "linkedin-data.xlsx" \
  --limit 5
```

**What to Check:**
- CPU usage reasonable
- Memory usage stable (no leaks)
- Chrome process closes cleanly

## Test Suite 7: Integration Testing

### Test 7.1: Full Workflow Test

Complete end-to-end workflow:

1. Clean slate: Remove all "Status" entries from Excel
2. Run with limit 5
3. Verify all 5 profiles processed
4. Check quota: 5/25
5. Check Excel: All 5 updated
6. Check LinkedIn: All 5 requests sent

### Test 7.2: Resume Day Testing

Test quota reset on new day:

1. Set quota date to yesterday in `linkedin_quota.json`
2. Run script
3. Verify quota resets to 0

## Common Issues and Solutions

### Issue 1: `no_connect_button` Error

**Solution:**
- Run with `--debug` to see available buttons
- Check if LinkedIn UI changed
- Update selectors in Methods 1-7

### Issue 2: `session_expired` Error

**Solution:**
- Get fresh `li_at` cookie from browser
- Check cookie hasn't expired
- Ensure logged into LinkedIn in same browser

### Issue 3: `modal_error` Error

**Solution:**
- Check if "Add a note" button selector changed
- Verify textarea selector is correct
- Run with `--debug` to see modal elements

### Issue 4: Rate Limiting

**Symptoms:**
- Multiple failures in a row
- Redirects to challenge/checkpoint

**Solution:**
- Stop immediately
- Wait 24 hours before retrying
- Reduce daily limit
- Increase delays between requests

## Success Criteria

✅ **All tests must pass:**
- [ ] Automated unit tests (37/37)
- [ ] Driver and Selenium tests
- [ ] Single connection request successful
- [ ] Already connected handled correctly
- [ ] Pending request handled correctly
- [ ] Follow-only handled correctly
- [ ] Multiple requests in sequence work
- [ ] Quota management works correctly
- [ ] Session expiration handled
- [ ] Excel file operations work
- [ ] Custom messages work
- [ ] All 7 Connect button methods work
- [ ] Modal handling works correctly
- [ ] Performance within acceptable range

## Test Results Template

```markdown
## Test Results - [Date]

### Environment
- Python Version: 
- Chrome Version: 
- LinkedIn UI Version: 

### Test Results
| Test Suite | Tests | Passed | Failed | Warnings |
|-----------|-------|--------|--------|----------|
| Unit Tests | 37 | | | |
| Driver Tests | 3 | | | |
| Manual Tests | 5 | | | |
| Regressive Tests | 6 | | | |
| UI Detection | 2 | | | |
| Performance | 2 | | | |
| Integration | 2 | | | |

### Issues Found
1. 
2. 
3. 

### Recommendations
1. 
2. 
3. 

### Sign-off
- Tester: 
- Date: 
- Status: ✅ PASS / ❌ FAIL
```

## Continuous Monitoring

After deployment, monitor:
1. GitHub Actions workflow logs
2. Success rate (target: >80%)
3. Common error patterns
4. LinkedIn UI changes

## Contact

For issues or questions:
- Check TESTING_GUIDE.md
- Check LINKEDIN_FIX_NOTES.md
- Review test script output
- Enable debug mode for detailed logs
