package com.digitaldodo.arth.core.network

import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.security.SecureStorage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

@Serializable
data class NativeTransactionDto(
    val id: String,
    val amount: String,
    val direction: String,
    val merchant: String? = null,
    @SerialName("transaction_date") val transactionDate: String,
    @SerialName("transaction_time") val transactionTime: String? = null,
    @SerialName("payment_method") val paymentMethod: String? = null,
    @SerialName("category_id") val categoryId: String? = null,
    val necessity: String? = null,
    val notes: String? = null,
    val reference: String? = null
)

@Serializable
data class NativeTransactionResponse(
    val success: Boolean = true,
    val message: String? = null,
    val id: String? = null
)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val icon: String = "category",
    val color: String = "#3B82F6",
    val type: String = "EXPENSE",
    @SerialName("is_system") val isSystem: Boolean = false,
    @SerialName("sort_order") val sortOrder: Int = 0
)

@Serializable
data class BalancesDto(
    @SerialName("cash_paise") val cashPaise: Long = 0L,
    @SerialName("online_paise") val onlinePaise: Long = 0L,
    @SerialName("configured_at") val configuredAt: Long? = null
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    val user: AuthUser
)

@Serializable
data class RefreshRequest(
    @SerialName("refresh_token") val refreshToken: String
)

@Serializable
data class AuthUser(
    val id: String,
    val email: String? = null
)

interface ArthApi {
    @POST("api/native/transactions")
    suspend fun createTransaction(@Body transaction: NativeTransactionDto): NativeTransactionResponse

    @GET("api/native/categories")
    suspend fun getCategories(): List<CategoryDto>

    @GET("api/v1/balances")
    suspend fun getBalances(): BalancesDto
}

interface SupabaseAuthApi {
    @POST("auth/v1/token?grant_type=password")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("auth/v1/token?grant_type=refresh_token")
    suspend fun refreshToken(@Body body: RefreshRequest): AuthResponse
}

class AuthInterceptor(private val secureStorage: SecureStorage) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val builder = original.newBuilder()

        // Inject anon key if configured
        if (BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
            builder.addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
        }

        // Inject bearer token if available
        secureStorage.getAccessToken()?.let { token ->
            builder.addHeader("Authorization", "Bearer $token")
        }

        return chain.proceed(builder.build())
    }
}

object NetworkClient {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    fun createArthApi(secureStorage: SecureStorage): ArthApi {
        val baseUrl = BuildConfig.API_URL.trimEnd('/') + "/"
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(secureStorage))
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
            })
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ArthApi::class.java)
    }

    fun createSupabaseAuthApi(): SupabaseAuthApi {
        val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/') + "/"
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val req = chain.request().newBuilder()
                    .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                    .build()
                chain.proceed(req)
            }
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(SupabaseAuthApi::class.java)
    }
}
