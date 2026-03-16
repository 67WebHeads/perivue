from django.urls import path
from users.views import TestLoginView, MeView, StaffListView

urlpatterns = [
    path("test-login/", TestLoginView.as_view(), name="test_login"),
    path("me/", MeView.as_view(), name="me"),
    path("staff/", StaffListView.as_view(), name="staff_list"),
]
