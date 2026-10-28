from django.urls import path

from .views import (
    ChatView,
    ConversationDetailView,
    ConversationListView,
    ConversationMessageView,
    DescribeView,
    ProductAssistView,
    SearchView,
    StatusView,
)

urlpatterns = [
    path("status/", StatusView.as_view(), name="ai-status"),
    path("describe/", DescribeView.as_view(), name="ai-describe"),
    path("products/<int:pk>/", ProductAssistView.as_view(), name="ai-product"),
    path("search/", SearchView.as_view(), name="ai-search"),
    path("chat/", ChatView.as_view(), name="ai-chat"),
    path("conversations/", ConversationListView.as_view(), name="ai-conversations"),
    path("conversations/<int:pk>/", ConversationDetailView.as_view(), name="ai-conversation"),
    path("conversations/<int:pk>/messages/", ConversationMessageView.as_view(), name="ai-conversation-message"),
]
