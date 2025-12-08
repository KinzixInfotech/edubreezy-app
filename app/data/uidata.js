
export const dataUi = {
  "header": {
    "student": {
      "title": "{name}",
      "subtitle": [
        { "text": "{classSection}", "type": "childClass" }
      ],
      "icons": ["refresh", "bell"]
    },
    "teaching_staff": {
      "title": "{name}",
      "subtitle": [
        // { "text": "{role.name}", "type": "role" },
        // { "text": "|", "type": "separator" },
        { "text": "{class}", "type": "class" },
        // { "text": "{section}", "type": "section" },
      ],
      "icons": ["refresh", "bell"]
    },
    "admin": {
      "title": "{name}",
      "subtitle": [
        { "text": "Administrator", "type": "static" },
        { "text": "|", "type": "separator" },
        { "text": "{school.name}", "type": "school" }
      ],
      "icons": ["refresh", "settings"]
    },
    "parent": {
      "title": "{name}",
      "subtitle": [
        // { "text": "Parent", "type": "static" },
        // { "text": "|", "type": "separator" },
        { "text": "{emailparent}", "type": "static" }
      ],
      "icons": ["bell"]
    }
  },
  "upcomingExam": {
    "title": "Upcoming Exam",
    "date": "25th August 2025 | 11:00 AM",
    "subject": "English 2nd Paper",
    "icon": "📝",
    "backgroundColor": "#6B9FFF"
  },
  "todaysClasses": [
    {
      "id": "class_1",
      "subject": "Math",
      "time": "09:30 - 10:00",
      "topic": "Geometry",
      "teacher": {
        "name": "Shamsher Ali",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Shamsher"
      },
      "backgroundColor": "#D4F4DD"
    },
    {
      "id": "class_2",
      "subject": "Bengali",
      "time": "10:00 - 10:30",
      "topic": "Poetry",
      "teacher": {
        "name": "Shamsher Ali",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Shamsher2"
      },
      "backgroundColor": "#F4D4F4"
    }
  ],
  "quickAccess": [
    {
      "id": "qa_1",
      "label": "Homework",
      "backgroundColor": "#4A90E2",
      "textColor": "#FFFFFF",
      "route": "/homework/view"
    },
    {
      "id": "qa_2",
      "label": "Timetable",
      "backgroundColor": "#8B5CF6",
      "textColor": "#FFFFFF",
      "route": "/student/timetable"
    },
    {
      "id": "qa_3",
      "label": "Attendance",
      "backgroundColor": "#10B981",
      "textColor": "#FFFFFF",
      "route": "/student/attendance"
    },
    {
      "id": "qa_4",
      "label": "Library",
      "backgroundColor": "#F59E0B",
      "textColor": "#FFFFFF",
      "route": "/student/library"
    },
    {
      "id": "qa_5",
      "label": "Results",
      "backgroundColor": "#EF4444",
      "textColor": "#FFFFFF",
      "route": "/student/exam-results"
    },
    {
      "id": "qa_6",
      "label": "Certificates",
      "backgroundColor": "#06B6D4",
      "textColor": "#FFFFFF",
      "route": "/student/certificates"
    }
  ],
  "subjects": [
    {
      "id": "sub_1",
      "name": "General Math",
      "chapter": "Chapter: 5, Question 12-25",
      "submission": "Submission: 7th Aug",
      "backgroundColor": "#D4F4DD"
    },
    {
      "id": "sub_2",
      "name": "Bengali",
      "chapter": "Chapter: Poem - \"Bidrohi\"",
      "submission": "Submission: 12th Aug",
      "backgroundColor": "#F4D4F4"
    },
    {
      "id": "sub_3",
      "name": "Social Science",
      "chapter": "Chapter: 2, Question 1-10",
      "submission": "Submission: 14th Aug",
      "backgroundColor": "#FFF4D4"
    },
    {
      "id": "sub_4",
      "name": "Biology",
      "chapter": "Chapter: 3 - \"Cells\"",
      "submission": "Submission: 7th Aug",
      "backgroundColor": "#D4E4F4"
    }
  ],
  "notifications": {
    "today": [
      {
        "id": "notif_1",
        "title": "New Exam Schedule Published",
        "message": "The Mid-Term exam routine for Class 4 has been uploaded. Please check the Exam section.",
        "time": "1h",
        "read": false,
        "icon": "📋"
      },
      {
        "id": "notif_2",
        "title": "Your Child Marked Present Today",
        "message": "Attendance has been successfully recorded for Alif Rahman in Class 4A.",
        "time": "1h",
        "read": false,
        "icon": "✅"
      },
      {
        "id": "notif_3",
        "title": "Homework Assigned in English",
        "message": "Your child has new homework in English: \"Write a short story (100 words).\" Due in 2 days.",
        "time": "1h",
        "read": false,
        "icon": "📚"
      }
    ],
    "yesterday": [
      {
        "id": "notif_4",
        "title": "Message from Class Teacher",
        "message": "Ms. Faria (English Teacher): \"Please help your child revise chapters 3 and 4 for next week's test.\"",
        "time": "1h",
        "read": true,
        "icon": "💬"
      },
      {
        "id": "notif_5",
        "title": "Tuition Fee Reminder",
        "message": "Your child's tuition fee for July is due on 15th. Kindly make the payment on time.",
        "time": "1h",
        "read": true,
        "icon": "💰"
      }
    ]
  }
}

