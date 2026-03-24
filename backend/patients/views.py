from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from .models import Patient
from .serializers import (
    PatientListSerializer,
    PatientDetailSerializer,
    PatientCreateSerializer,
    PatientUpdateSerializer,
)


class PatientListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        patients = Patient.objects.all()

        search = request.query_params.get("search", "").strip()
        if search:
            patients = patients.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(patient_code__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
            )

        sex = request.query_params.get("sex", "").strip().upper()
        if sex in ("M", "F", "X", "U"):
            patients = patients.filter(sex=sex)

        serializer = PatientListSerializer(patients, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PatientCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        if serializer.is_valid():
            patient = serializer.save()
            return Response(
                PatientDetailSerializer(patient).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PatientDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        patient = get_object_or_404(Patient, pk=pk)
        return Response(PatientDetailSerializer(patient).data)

    def patch(self, request, pk):
        patient = get_object_or_404(Patient, pk=pk)
        serializer = PatientUpdateSerializer(patient, data=request.data, partial=True)
        if serializer.is_valid():
            return Response(PatientDetailSerializer(serializer.save()).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        get_object_or_404(Patient, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
