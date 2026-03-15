from django.urls import path
from users.views import TestLoginView, MeView

urlpatterns = [
    path("test-login/", TestLoginView.as_view(), name="test_login"),
    path("me/", MeView.as_view(), name="me"),
]
