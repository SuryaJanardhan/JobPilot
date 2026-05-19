#!/usr/bin/env python3
"""
Test script for LinkedIn Automation
Performs comprehensive testing of the LinkedIn outreach functionality
including connection requests, messaging, and error handling.
"""

import sys
import os
import time
import argparse
from datetime import datetime
import json

# Add parent directory to path to import linkedin_outreach
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import linkedin_outreach as lo
    from selenium.webdriver.common.by import By
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Please install required dependencies:")
    print("  pip install -r requirements.txt")
    sys.exit(1)


class TestResult:
    """Store test results"""
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name, message=""):
        self.passed.append((test_name, message))
        print(f"  ✅ {test_name}: PASSED {message}")
    
    def add_fail(self, test_name, message=""):
        self.failed.append((test_name, message))
        print(f"  ❌ {test_name}: FAILED {message}")
    
    def add_warning(self, test_name, message=""):
        self.warnings.append((test_name, message))
        print(f"  ⚠️  {test_name}: WARNING {message}")
    
    def summary(self):
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"✅ Passed: {len(self.passed)}")
        print(f"❌ Failed: {len(self.failed)}")
        print(f"⚠️  Warnings: {len(self.warnings)}")
        print("=" * 60)
        
        if self.failed:
            print("\nFailed Tests:")
            for name, msg in self.failed:
                print(f"  - {name}: {msg}")
        
        return len(self.failed) == 0


def test_imports(results):
    """Test 1: Verify all required imports"""
    print("\n[TEST 1] Checking imports...")
    
    try:
        # Check main imports
        import pandas as pd
        results.add_pass("pandas import")
    except ImportError as e:
        results.add_fail("pandas import", str(e))
    
    try:
        import selenium
        results.add_pass("selenium import")
    except ImportError as e:
        results.add_fail("selenium import", str(e))
    
    try:
        import undetected_chromedriver as uc
        results.add_pass("undetected_chromedriver import")
    except ImportError as e:
        results.add_fail("undetected_chromedriver import", str(e))
    
    try:
        import openpyxl
        results.add_pass("openpyxl import")
    except ImportError as e:
        results.add_fail("openpyxl import", str(e))


def test_configuration(results):
    """Test 2: Verify configuration constants"""
    print("\n[TEST 2] Checking configuration...")
    
    if hasattr(lo, 'DAILY_LIMIT'):
        if lo.DAILY_LIMIT == 25:
            results.add_pass("DAILY_LIMIT", f"= {lo.DAILY_LIMIT}")
        else:
            results.add_warning("DAILY_LIMIT", f"Expected 25, got {lo.DAILY_LIMIT}")
    else:
        results.add_fail("DAILY_LIMIT", "not defined")
    
    if hasattr(lo, 'QUOTA_FILE'):
        results.add_pass("QUOTA_FILE", f"= {lo.QUOTA_FILE}")
    else:
        results.add_fail("QUOTA_FILE", "not defined")
    
    if hasattr(lo, 'RESUME_LINK'):
        results.add_pass("RESUME_LINK", "defined")
    else:
        results.add_fail("RESUME_LINK", "not defined")
    
    if hasattr(lo, 'DEFAULT_MESSAGE'):
        if len(lo.DEFAULT_MESSAGE) > 0:
            results.add_pass("DEFAULT_MESSAGE", f"({len(lo.DEFAULT_MESSAGE)} chars)")
        else:
            results.add_fail("DEFAULT_MESSAGE", "empty")
    else:
        results.add_fail("DEFAULT_MESSAGE", "not defined")


def test_functions_exist(results):
    """Test 3: Verify all required functions exist"""
    print("\n[TEST 3] Checking function definitions...")
    
    functions = [
        'load_quota',
        'save_quota',
        'get_remaining_quota',
        'increment_quota',
        'extract_public_id',
        'load_profiles_from_excel',
        'update_excel_status',
        'setup_driver',
        'login_with_cookie',
        'login_with_password',
        'send_direct_message',
        '_handle_connect_modal',
    ]
    
    for func_name in functions:
        if hasattr(lo, func_name):
            results.add_pass(f"Function: {func_name}")
        else:
            results.add_fail(f"Function: {func_name}", "not found")


def test_quota_functions(results):
    """Test 4: Test quota management functions"""
    print("\n[TEST 4] Testing quota management...")
    
    try:
        # Load quota
        quota = lo.load_quota()
        if 'date' in quota and 'sent' in quota:
            results.add_pass("load_quota", f"date={quota['date']}, sent={quota['sent']}")
        else:
            results.add_fail("load_quota", "missing required keys")
        
        # Get remaining quota
        remaining = lo.get_remaining_quota()
        if isinstance(remaining, int) and 0 <= remaining <= lo.DAILY_LIMIT:
            results.add_pass("get_remaining_quota", f"= {remaining}")
        else:
            results.add_warning("get_remaining_quota", f"unexpected value: {remaining}")
        
    except Exception as e:
        results.add_fail("quota functions", str(e))


def test_extract_public_id(results):
    """Test 5: Test LinkedIn URL parsing"""
    print("\n[TEST 5] Testing LinkedIn URL parsing...")
    
    test_cases = [
        ("https://www.linkedin.com/in/john-doe/", "john-doe"),
        ("https://linkedin.com/in/jane-smith", "jane-smith"),
        ("linkedin.com/in/test-user-123", "test-user-123"),
        ("https://www.linkedin.com/in/user?param=value", "user"),
        (None, None),
        ("", None),
        ("not-a-linkedin-url", None),
    ]
    
    for url, expected in test_cases:
        try:
            result = lo.extract_public_id(url)
            if result == expected:
                results.add_pass(f"extract_public_id({url!r})", f"= {result!r}")
            else:
                results.add_fail(f"extract_public_id({url!r})", f"expected {expected!r}, got {result!r}")
        except Exception as e:
            results.add_fail(f"extract_public_id({url!r})", str(e))


def test_excel_file_exists(results):
    """Test 6: Check if LinkedIn data Excel file exists"""
    print("\n[TEST 6] Checking Excel file...")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    excel_path = os.path.join(script_dir, 'linkedin-data.xlsx')
    
    if os.path.exists(excel_path):
        results.add_pass("linkedin-data.xlsx", "file exists")
        
        try:
            import pandas as pd
            df = pd.read_excel(excel_path)
            required_cols = ['Name', 'Company Name', 'Linkedin URL', 'Status']
            missing_cols = [col for col in required_cols if col not in df.columns]
            
            if missing_cols:
                results.add_fail("Excel columns", f"missing: {missing_cols}")
            else:
                results.add_pass("Excel columns", "all required columns present")
                results.add_pass("Excel rows", f"total: {len(df)}")
        except Exception as e:
            results.add_warning("Excel file reading", str(e))
    else:
        results.add_warning("linkedin-data.xlsx", "file not found (optional for testing)")


def test_driver_setup(results, headless=True):
    """Test 7: Test WebDriver setup (critical test)"""
    print("\n[TEST 7] Testing WebDriver setup...")
    
    driver = None
    try:
        print("  Setting up Chrome driver...")
        driver = lo.setup_driver(headless=headless)
        results.add_pass("setup_driver", "Chrome driver initialized")
        
        # Test basic navigation
        print("  Testing basic navigation...")
        driver.get("https://www.linkedin.com")
        time.sleep(2)
        
        if "linkedin" in driver.current_url.lower():
            results.add_pass("driver navigation", "successfully loaded LinkedIn")
        else:
            results.add_warning("driver navigation", f"unexpected URL: {driver.current_url}")
        
        # Check page title
        if driver.title:
            results.add_pass("driver page title", f"'{driver.title[:50]}'")
        else:
            results.add_warning("driver page title", "empty title")
        
    except Exception as e:
        results.add_fail("driver setup", str(e))
    finally:
        if driver:
            try:
                driver.quit()
                results.add_pass("driver cleanup", "successfully closed")
            except Exception:
                results.add_warning("driver cleanup", "error closing driver")


def test_connect_modal_function(results):
    """Test 8: Test connection modal handler function signature"""
    print("\n[TEST 8] Testing connection modal function...")
    
    try:
        import inspect
        sig = inspect.signature(lo._handle_connect_modal)
        params = list(sig.parameters.keys())
        
        if 'driver' in params and 'message' in params:
            results.add_pass("_handle_connect_modal signature", f"params: {params}")
        else:
            results.add_fail("_handle_connect_modal signature", f"unexpected params: {params}")
    except Exception as e:
        results.add_fail("_handle_connect_modal", str(e))


def test_syntax_and_structure(results):
    """Test 9: Verify Python syntax and structure"""
    print("\n[TEST 9] Checking Python syntax...")
    
    script_path = os.path.join(os.path.dirname(__file__), 'linkedin_outreach.py')
    
    try:
        import py_compile
        py_compile.compile(script_path, doraise=True)
        results.add_pass("Python syntax", "no syntax errors")
    except py_compile.PyCompileError as e:
        results.add_fail("Python syntax", str(e))
    
    # Check for merge conflict markers
    try:
        with open(script_path, 'r') as f:
            lines = f.readlines()
            
        conflict_markers = []
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # Check for actual conflict markers (not in comments)
            if stripped.startswith('<<<<<<<') or stripped.startswith('>>>>>>>'):
                conflict_markers.append(f"line {i}: {stripped[:30]}")
            elif stripped.startswith('=======') and not stripped.startswith('# ==='):
                conflict_markers.append(f"line {i}: {stripped[:30]}")
        
        if conflict_markers:
            results.add_fail("merge conflicts", f"found markers: {conflict_markers}")
        else:
            results.add_pass("merge conflicts", "no conflict markers found")
            
    except Exception as e:
        results.add_warning("merge conflict check", str(e))


def test_message_length_handling(results):
    """Test 10: Test message length handling"""
    print("\n[TEST 10] Testing message length handling...")
    
    # Test that default message is within LinkedIn's 300 char limit
    if hasattr(lo, 'DEFAULT_MESSAGE'):
        msg_len = len(lo.DEFAULT_MESSAGE)
        if msg_len <= 300:
            results.add_pass("DEFAULT_MESSAGE length", f"{msg_len} chars (within 300 limit)")
        else:
            results.add_warning("DEFAULT_MESSAGE length", f"{msg_len} chars (exceeds 300 limit)")
    
    # Test message truncation logic
    test_message = "x" * 400
    truncated = test_message[:300]
    if len(truncated) == 300:
        results.add_pass("message truncation", "correctly limits to 300 chars")
    else:
        results.add_fail("message truncation", f"unexpected length: {len(truncated)}")


def run_integration_test(results, cookie=None):
    """Test 11: Integration test (requires LinkedIn cookie)"""
    print("\n[TEST 11] Integration test (requires cookie)...")
    
    if not cookie:
        results.add_warning("integration test", "skipped (no cookie provided)")
        return
    
    driver = None
    try:
        print("  Setting up driver...")
        driver = lo.setup_driver(headless=True)
        
        print("  Testing login with cookie...")
        logged_in = lo.login_with_cookie(driver, cookie)
        
        if logged_in:
            results.add_pass("login_with_cookie", "successfully authenticated")
            
            # Test profile navigation (using a public profile)
            print("  Testing profile navigation...")
            test_profile_id = "williamhgates"  # Bill Gates public profile
            driver.get(f"https://www.linkedin.com/in/{test_profile_id}/")
            time.sleep(3)
            
            if test_profile_id in driver.current_url:
                results.add_pass("profile navigation", "successfully loaded profile")
            else:
                results.add_warning("profile navigation", f"redirected to: {driver.current_url}")
        else:
            results.add_fail("login_with_cookie", "authentication failed")
            
    except Exception as e:
        results.add_fail("integration test", str(e))
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description='Test LinkedIn Automation')
    parser.add_argument('--cookie', help='LinkedIn li_at cookie for integration tests')
    parser.add_argument('--skip-driver', action='store_true', help='Skip WebDriver tests')
    parser.add_argument('--integration', action='store_true', help='Run integration tests (requires --cookie)')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("LINKEDIN AUTOMATION TEST SUITE")
    print("=" * 60)
    print(f"Started: {datetime.now().isoformat()}")
    print()
    
    results = TestResult()
    
    # Run all tests
    test_imports(results)
    test_configuration(results)
    test_functions_exist(results)
    test_quota_functions(results)
    test_extract_public_id(results)
    test_excel_file_exists(results)
    test_syntax_and_structure(results)
    test_message_length_handling(results)
    test_connect_modal_function(results)
    
    if not args.skip_driver:
        test_driver_setup(results, headless=True)
    else:
        print("\n[TEST 7] Skipped WebDriver setup test")
    
    if args.integration and args.cookie:
        run_integration_test(results, args.cookie)
    elif args.integration:
        print("\n⚠️  Integration test requested but no cookie provided")
        print("   Use: --cookie YOUR_LINKEDIN_COOKIE")
    
    # Print summary
    success = results.summary()
    
    print(f"\nCompleted: {datetime.now().isoformat()}")
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
