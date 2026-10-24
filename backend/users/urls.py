from django.urls import path
from users.views import (
    TestLoginView, GoogleLoginCompleteView, MeView, StaffListView,
    UserManagementListCreateView, UserManagementDetailView,
)

urlpatterns = [
    path("test-login/",   TestLoginView.as_view(),               name="test_login"),
    path("google/complete/", GoogleLoginCompleteView.as_view(),  name="google_login_complete"),
    path("me/",           MeView.as_view(),                      name="me"),
    path("staff/",        StaffListView.as_view(),               name="staff_list"),
    path("manage/",       UserManagementListCreateView.as_view(), name="user-manage-list"),
    path("manage/<uuid:pk>/", UserManagementDetailView.as_view(), name="user-manage-detail"),
]