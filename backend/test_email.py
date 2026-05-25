import os
from dotenv import load_dotenv
from alert_service import send_email_alert

load_dotenv()

print("Testing SMTP Configuration...")
print(f"User: {os.getenv('EMAIL_USER')}")

success = send_email_alert(
    "amansah1717@gmail.com", 
    "AATMS Automated Test", 
    "This is a test email from the AATMS Kafka Alert Service. Your SMTP configuration is working perfectly!"
)

if success:
    print("Email sent successfully!")
else:
    print("Email failed to send. Check logs.")
